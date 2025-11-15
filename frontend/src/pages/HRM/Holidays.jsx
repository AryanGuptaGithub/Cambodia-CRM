import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Eye,
  Edit,
  Trash2,
  Upload,
  X,
  Search,
  Calendar,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import SampleExcelDownloadHolidays from "../../excels/SampleExcelDownloadHolidays";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const holidaysPerPage = 7;
const upcomingHolidaysPerPage = 3;

const Holidays = () => {
  const navigate = useNavigate();

  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  const [form, setForm] = useState({
    startDate: "",
    endDate: "",
    name: "",
    description: "",
    _id: null,
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Calendar view states
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [calendarViewType, setCalendarViewType] = useState("monthly");
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Upcoming holidays pagination
  const [upcomingHolidaysPage, setUpcomingHolidaysPage] = useState(1);

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/holidays`);
      if (!response.ok) throw new Error("Failed to fetch holidays");
      const data = await response.json();
      setHolidays(data.holidays || []);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const formatDateToShort = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = date.toLocaleString("default", { month: "short" });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Get current year as string
  const currentYearString = new Date().getFullYear().toString();

  // Filter holidays to show only current year based on yearCode array - FOR TABLE ONLY
  const currentYearHolidays = useMemo(() => {
    return holidays.filter(
      (holiday) =>
        holiday.yearCode &&
        Array.isArray(holiday.yearCode) &&
        holiday.yearCode.includes(currentYearString)
    );
  }, [holidays, currentYearString]);

  // For calendar, use ALL holidays (both 2025 and 2026)
  const allHolidaysForCalendar = useMemo(() => {
    return holidays; // Use all holidays for calendar display
  }, [holidays]);

  const filteredHolidays = currentYearHolidays.filter(
    (r) =>
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.startDate &&
        r.startDate.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Get holidays for the entire current year - FOR CALENDAR (FIXED)
  const currentYearFilteredHolidays = useMemo(() => {
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);
    endOfYear.setHours(23, 59, 59, 999);

    return allHolidaysForCalendar
      .filter((holiday) => {
        if (!holiday.startDate) return false;
        
        const holidayStart = new Date(holiday.startDate);
        const holidayEnd = new Date(holiday.endDate || holiday.startDate);
        
        holidayStart.setHours(0, 0, 0, 0);
        holidayEnd.setHours(0, 0, 0, 0);

        return (
          (holidayStart <= endOfYear && holidayEnd >= startOfYear)
        );
      })
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [allHolidaysForCalendar, currentYear]);

  // Calendar view functions
  const isSunday = (date) => {
    return date.getDay() === 0;
  };

  const isHoliday = (date) => {
    const dateString = date.toISOString().split("T")[0];
    return allHolidaysForCalendar.some((holiday) => {
      if (!holiday.startDate) return false;
      const holidayStart = new Date(holiday.startDate);
      const holidayEnd = new Date(holiday.endDate || holiday.startDate);

      const holidayStartString = holidayStart.toISOString().split("T")[0];
      const holidayEndString = holidayEnd.toISOString().split("T")[0];

      return dateString >= holidayStartString && dateString <= holidayEndString;
    });
  };

  const getHolidayName = (dateString) => {
    const holiday = allHolidaysForCalendar.find((h) => {
      if (!h.startDate) return false;
      const holidayStart = new Date(h.startDate);
      const holidayEnd = new Date(h.endDate || h.startDate);

      const holidayStartString = holidayStart.toISOString().split("T")[0];
      const holidayEndString = holidayEnd.toISOString().split("T")[0];

      return dateString >= holidayStartString && dateString <= holidayEndString;
    });
    return holiday ? holiday.name : "";
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

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const prevYear = () => {
    setCurrentYear(currentYear - 1);
  };

  const nextYear = () => {
    setCurrentYear(currentYear + 1);
  };

  // Calendar date click
  const handleCalendarDateClick = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    // Check if holiday already exists for this date
    const existingHoliday = allHolidaysForCalendar.find((h) => {
      if (!h.startDate) return false;
      const holidayDate = new Date(h.startDate);
      const holidayDateString = holidayDate.toISOString().split("T")[0];
      return holidayDateString === dateString;
    });

    if (existingHoliday) {
      setForm({
        ...existingHoliday,
        startDate: existingHoliday.startDate || "",
        endDate: existingHoliday.endDate || existingHoliday.startDate || "",
      });
      setIsViewModalOpen(true);
    }
  };

  // Missing functions - ADD THESE
  const handleAddButtonClick = () => {
    setIsAddModalOpen(true);
    setForm({
      startDate: "",
      endDate: "",
      name: "",
      description: "",
      _id: null,
    });
  };

  const handleIconClick = () => {
    inputRef.current?.focus();
    inputRef.current?.classList.add("highlight");
    setTimeout(() => inputRef.current?.classList.remove("highlight"), 1000);
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentHolidays.map((h) => ({ id: h._id }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  const toggleSelect = (holiday) => {
    setSelected((prev) => {
      const exists = prev.some((h) => h.id === holiday._id);
      if (exists) {
        return prev.filter((h) => h.id !== holiday._id);
      } else {
        return [...prev, { id: holiday._id }];
      }
    });
  };

  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> holiday(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/holidays`, {
          data: { ids: selected.map((s) => s.id) },
        });

        if (res.status === 200) {
          showToast("success", "Selected holidays deleted successfully");
          fetchHolidays();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected holidays.");
      }
    }
  };

  const handleView = (holiday) => {
    setForm(holiday);
    setIsViewModalOpen(true);
  };

  const editHoliday = (holiday) => {
    setForm(holiday);
    setIsEditModalOpen(true);
  };

  const deleteHoliday = async (holiday) => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${holiday.name}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/holidays/${holiday._id}`);
        if (res.status === 200) {
          showToast("success", `${holiday.name} deleted successfully`);
          fetchHolidays();
        }
      } catch (error) {
        showToast("error", "Failed to delete holiday.");
      }
    }
  };

  const handleCloseImportModal = () => {
    setShowImportModal(false);
    setParsedData([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const expectedHeaders = ["Date", "Holiday Name", "Description"];
        let headerIdx = -1;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i].map((c) => c?.toString().trim());
          const normalized = row.map((c) => c.toLowerCase());
          const matchCount = expectedHeaders.filter((h) =>
            normalized.includes(h.toLowerCase())
          ).length;
          if (matchCount >= 2) {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx === -1) {
          showToast("error", "Header row not found in the Excel file");
          return;
        }

        const headers = rows[headerIdx].map((h) => h?.toString().trim());
        const dataRows = rows.slice(headerIdx + 1);

        const json = dataRows.map((row) => {
          const obj = {};
          headers.forEach((h, i) => (obj[h] = row[i] ?? ""));
          return obj;
        });

        const finalData = json
          .filter((item) => item.Date && item["Holiday Name"])
          .map((item) => ({
            startDate: item.Date,
            endDate: item.Date,
            name: item["Holiday Name"],
            description: item.Description || "",
          }));

        setParsedData(finalData);
        showToast("success", `Found ${finalData.length} holidays to import`);
      } catch (error) {
        console.error("Error reading file:", error);
        showToast("error", "Failed to process Excel file");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!parsedData.length) {
      showToast("warning", "Please upload a file first");
      return;
    }

    setIsUploading(true);
    try {
      const res = await axios.post(`${backendUrl}/api/holidays/import`, parsedData);
      if (res.status === 200) {
        showToast("success", "Holidays imported successfully");
        setShowImportModal(false);
        setParsedData([]);
        fetchHolidays();
      }
    } catch (err) {
      showToast("error", "Failed to import holidays");
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartDateChange = (date) => {
    setForm((prev) => ({
      ...prev,
      startDate: date ? date.toISOString().split("T")[0] : "",
    }));
  };

  const handleEndDateChange = (date) => {
    setForm((prev) => ({
      ...prev,
      endDate: date ? date.toISOString().split("T")[0] : "",
    }));
  };

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!form.name || !form.startDate) {
      showToast("error", "Please fill in all required fields");
      return;
    }

    try {
      const payload = {
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        description: form.description,
      };

      const res = await axios.post(`${backendUrl}/api/holidays`, payload);
      if (res.status === 201) {
        showToast("success", "Holiday added successfully");
        setIsAddModalOpen(false);
        setForm({ startDate: "", endDate: "", name: "", description: "", _id: null });
        fetchHolidays();
      }
    } catch (err) {
      showToast("error", "Failed to add holiday");
    }
  };

  const handleUpdateHoliday = async (e) => {
    e.preventDefault();
    if (!form.name || !form.startDate) {
      showToast("error", "Please fill in all required fields");
      return;
    }

    try {
      const payload = {
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        description: form.description,
      };

      const res = await axios.put(`${backendUrl}/api/holidays/${form._id}`, payload);
      if (res.status === 200) {
        showToast("success", "Holiday updated successfully");
        setIsEditModalOpen(false);
        setForm({ startDate: "", endDate: "", name: "", description: "", _id: null });
        fetchHolidays();
      }
    } catch (err) {
      showToast("error", "Failed to update holiday");
    }
  };

  // NEW: Get holidays for specific month in annual view
  const getHolidaysForMonth = (monthIndex) => {
    return currentYearFilteredHolidays.filter((holiday) => {
      if (!holiday.startDate) return false;
      
      const holidayStart = new Date(holiday.startDate);
      const holidayEnd = new Date(holiday.endDate || holiday.startDate);
      
      // Check if holiday overlaps with the specified month
      const startOfMonth = new Date(currentYear, monthIndex, 1);
      const endOfMonth = new Date(currentYear, monthIndex + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      return (
        holidayStart <= endOfMonth && 
        holidayEnd >= startOfMonth
      );
    });
  };

  // Calendar rendering functions
  const renderMonthlyCalendar = () => {
    const days = getDaysInMonth();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-xl font-semibold">
            {monthNames[currentMonth]} {currentYear}
          </h2>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map((day) => (
            <div key={day} className="p-2 text-center font-medium text-gray-600 text-sm">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="p-2" />;
            }

            const isCurrentMonth = date.getMonth() === currentMonth;
            const isToday = date.toDateString() === today.toDateString();
            const dateString = date.toISOString().split("T")[0];
            const isHolidayDate = isHoliday(date);
            const isSundayDate = isSunday(date);
            const holidayName = getHolidayName(dateString);

            let bgColor = "bg-white";
            let borderColor = "border-gray-200";
            let textColor = "text-gray-700";

            if (isSundayDate) {
              bgColor = "bg-gray-400";
              borderColor = "border-gray-500";
              textColor = "text-white";
            } else if (isHolidayDate) {
              bgColor = "bg-red-500";
              borderColor = "border-red-600";
              textColor = "text-white";
            } else if (isToday) {
              bgColor = "bg-blue-50";
              borderColor = "border-blue-500";
            } else if (!isCurrentMonth) {
              bgColor = "bg-gray-50";
              textColor = "text-gray-400";
            }

            return (
              <div
                key={dateString}
                onClick={() => handleCalendarDateClick(date)}
                className={`min-h-[80px] p-2 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${bgColor} ${borderColor} ${textColor} ${
                  !isCurrentMonth ? "opacity-50" : ""
                }`}
              >
                <div className="flex justify-between items-start">
                  <span className={`text-sm font-medium ${isSundayDate || isHolidayDate ? "text-white" : "text-gray-900"}`}>
                    {date.getDate()}
                  </span>
                </div>
                {isHolidayDate && holidayName && (
                  <div className="mt-1">
                    <span className="text-xs font-medium truncate block">
                      {holidayName}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // UPDATED: Annual calendar with grid layout similar to Attendance component
  const renderAnnualCalendar = () => {
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const today = new Date();
    const currentYearToday = today.getFullYear();
    const currentMonthToday = today.getMonth();

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={prevYear}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-xl font-semibold">{currentYear}</h2>
          <button
            onClick={nextYear}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {monthNames.map((monthName, monthIndex) => {
            const monthDays = getDaysInMonth(currentYear, monthIndex);
            const isCurrentMonth = monthIndex === currentMonthToday && currentYear === currentYearToday;
            const monthHolidays = getHolidaysForMonth(monthIndex);

            return (
              <div
                key={monthName}
                className={`border rounded-lg p-4 ${
                  isCurrentMonth
                    ? "border-blue-500 bg-blue-50 shadow-md"
                    : "border-gray-200 bg-white"
                }`}
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
                  {monthHolidays.length > 0 && (
                    <span className="block text-xs font-normal text-red-600 mt-1">
                      {monthHolidays.length} holiday(s)
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

                    const isSundayDay = isSunday(date);
                    const isHolidayDate = isHoliday(date);
                    const isToday = date.toDateString() === today.toDateString();
                    const dateString = date.toISOString().split("T")[0];
                    const holidayName = getHolidayName(dateString);

                    // Determine cell style based on conditions
                    let cellStyle = "h-6 flex items-center justify-center rounded text-xs cursor-pointer ";

                    if (isToday) {
                      cellStyle += "bg-blue-500 text-white ";
                    } else if (isHolidayDate) {
                      cellStyle += "bg-red-500 text-white ";
                    } else if (isSundayDay) {
                      cellStyle += "bg-gray-400 text-white ";
                    } else {
                      cellStyle += "bg-gray-100 ";
                    }

                    return (
                      <div
                        key={dateString}
                        className={cellStyle.trim()}
                        onClick={() => handleCalendarDateClick(date)}
                        title={
                          isHolidayDate
                            ? `Holiday: ${holidayName}`
                            : isSundayDay
                            ? "Sunday"
                            : "Normal day"
                        }
                      >
                        {date.getDate()}
                      </div>
                    );
                  })}
                </div>

                {/* Holiday list for the month */}
                {monthHolidays.length > 0 && (
                  <div className="mt-3 border-t pt-2">
                    <div className="space-y-1 max-h-20 overflow-y-auto">
                      {monthHolidays.map((holiday, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-1 bg-red-50 rounded text-xs cursor-pointer hover:bg-red-100"
                          onClick={() => {
                            setForm(holiday);
                            setIsViewModalOpen(true);
                          }}
                        >
                          <span className="text-red-800 font-medium truncate">
                            {holiday.name}
                          </span>
                          <span className="text-red-600 text-xs">
                            {formatDateToShort(holiday.startDate)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-4 items-center justify-center text-sm bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span>Holiday</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-400 rounded"></div>
            <span>Sunday</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span>Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 rounded border border-gray-300"></div>
            <span>Working Day</span>
          </div>
        </div>
      </div>
    );
  };

  // Calculate pagination variables
  const totalPages = Math.ceil(filteredHolidays.length / holidaysPerPage);
  const currentHolidays = filteredHolidays.slice(
    (currentPage - 1) * holidaysPerPage,
    currentPage * holidaysPerPage
  );

  const getVisiblePages = (currentPage, totalPages) => {
    const visiblePages = [];
    const showPages = 5;
    
    let startPage = Math.max(1, currentPage - Math.floor(showPages / 2));
    let endPage = Math.min(totalPages, startPage + showPages - 1);
    
    if (endPage - startPage + 1 < showPages) {
      startPage = Math.max(1, endPage - showPages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      visiblePages.push(i);
    }
    
    return visiblePages;
  };

  const visiblePages = getVisiblePages(currentPage, totalPages);

  if (loading) return <div className="p-6 text-center">Loading...</div>;
  if (error) return <div className="p-6 text-red-500 text-center">{error}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={handleAddButtonClick}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Plus size={18} /> Add New Holiday
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Upload size={18} /> Import CSV
          </button>

          <button
            onClick={() => setShowCalendarView(!showCalendarView)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Calendar size={18} />{" "}
            {showCalendarView ? "Show Table" : "Show Calendar"}
          </button>

          {selected.length > 0 && (
            <button
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={handleDeleteSelected}
            >
              <Trash2 size={18} /> Delete Selected ({selected.length})
            </button>
          )}
        </div>

        {!showCalendarView &&  holidays.length > 0 && (
          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {filteredHolidays.length} ({currentYearString})
              </span>
            </p>
            <div className="relative w-full md:w-72">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
                onClick={handleIconClick}
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search holidays..."
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

      {showCalendarView ? (
        <>
          {/* Calendar View Toggle and Legend */}
          <div className="flex justify-between items-center mb-4 bg-white rounded-2xl shadow border border-gray-200 p-4">
            <div className="flex gap-2">
              <button
                onClick={() => setCalendarViewType("monthly")}
                className={`px-4 py-2 rounded-lg font-medium cursor-pointer ${
                  calendarViewType === "monthly"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setCalendarViewType("annual")}
                className={`px-4 py-2 rounded-lg font-medium cursor-pointer ${
                  calendarViewType === "annual"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Annual
              </button>
            </div>

            <div className="flex gap-6 text-sm flex-wrap justify-center">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded border-2 border-red-600"></div>
                <span>Holiday</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-400 rounded border-2 border-gray-500"></div>
                <span>Sunday</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-50 rounded border-2 border-gray-200"></div>
                <span>Working Day</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-50 rounded border-2 border-blue-500"></div>
                <span>Today</span>
              </div>
            </div>
          </div>

          {/* Calendar Display - Shows ALL holidays (2025 + 2026) */}
          {calendarViewType === "monthly"
            ? renderMonthlyCalendar()
            : renderAnnualCalendar()}
        </>
      ) : (
        /* Table View - Shows ONLY current year (2025) holidays */
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            {/* Table Header with Checkbox */}
            <thead className="bg-gray-100 text-gray-700 border-b text-sm">
              <tr>
                <th className="p-3">
                  <div className="flex items-center gap-3">
                    {currentHolidays.length > 0 && (
                      <input
                        type="checkbox"
                        checked={
                          selected.length === currentHolidays.length &&
                          currentHolidays.length > 0
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        className="cursor-pointer"
                      />
                    )}
                    <span>Sr No</span>
                  </div>
                </th>
                <th className="p-3">Holiday Name</th>
                <th className="p-3">Start Date</th>
                <th className="p-3">End Date</th>
                <th className="p-3">Description</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {currentHolidays.length > 0 ? (
                currentHolidays.map((holiday, index) => {
                  const formattedStartDate = formatDateToReadable(
                    holiday.startDate
                  );
                  const formattedEndDate = formatDateToReadable(
                    holiday.endDate || holiday.startDate
                  );

                  // Check if holiday is selected
                  const isSelected = selected.some((s) => s.id === holiday._id);

                  return (
                    <tr
                      key={holiday._id}
                      className={`hover:bg-gray-50 ${
                        (index + 1) % holidaysPerPage === 0 ||
                        index + 1 === currentHolidays.length
                          ? ""
                          : "border-b"
                      } ${isSelected ? "bg-blue-50" : ""}`}
                    >
                      {/* Checkbox Cell */}
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(holiday)}
                            className="cursor-pointer"
                          />
                          <span>
                            {(currentPage - 1) * holidaysPerPage + index + 1}
                          </span>
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="capitalize font-medium text-gray-800">
                            {holiday.name}
                          </span>
                          <span className="text-sm text-gray-500">
                            ({formattedStartDate})
                          </span>
                        </div>
                      </td>

                      <td className="p-3">{formattedStartDate}</td>
                      <td className="p-3">{formattedEndDate}</td>

                      <td className="p-3 capitalize">
                        {holiday.description || "No description"}
                      </td>

                      <td className="p-3 flex items-center justify-center gap-3">
                        <button
                          onClick={() => handleView(holiday)}
                          className="text-blue-600 hover:text-blue-800 cursor-pointer"
                          title="View"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => editHoliday(holiday)}
                          className="text-green-600 hover:text-green-800 cursor-pointer"
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => deleteHoliday(holiday)}
                          className="text-red-600 hover:text-red-800 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-3 text-center text-gray-500">
                    No holiday records found for {currentYearString}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {currentHolidays.length > 0 && (
            <div className="mt-4 p-5 flex justify-start gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Prev
              </button>
              {visiblePages.map((page, idx) =>
                page === "..." ? (
                  <span
                    key={`ellipsis-${idx}`}
                    className="px-3 py-1 text-gray-500 select-none cursor-pointer"
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
      )}

      {/* Rest of the modals (Import, Add, Edit, View) remain the same */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={handleCloseImportModal}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                disabled={isUploading}
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Import Holidays
              </h2>
              {isSampleFile && <SampleExcelDownloadHolidays />}
              <div className="mb-6">
                <label className="block text-gray-700 mb-2">
                  Upload Excel File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
                  disabled={isUploading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Supported formats: Excel (.xlsx, .xls)
                </p>
              </div>

              {parsedData.length > 0 && (
                <div className="mb-4 p-3 bg-green-50 rounded-lg">
                  <p className="text-green-700 text-sm">
                    Found {parsedData.length} holidays ready to import
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={handleCloseImportModal}
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
                  {isUploading ? "Uploading…" : "Import Holidays"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Add Holiday Modal */}
      {isAddModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Add New Holiday
              </h2>
              <form
                onSubmit={handleAddHoliday}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium">
                    Holiday Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                    required
                    placeholder="Enter holiday name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={form.startDate ? new Date(form.startDate) : null}
                    onChange={handleStartDateChange}
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select start date"
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={form.endDate ? new Date(form.endDate) : null}
                    onChange={handleEndDateChange}
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select end date"
                    minDate={form.startDate ? new Date(form.startDate) : null}
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    rows="3"
                    placeholder="Optional description"
                  />
                </div>
              </form>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddHoliday}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                >
                  Add Holiday
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Edit Holiday Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Holiday
              </h2>
              <form
                onSubmit={handleUpdateHoliday}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium">
                    Holiday Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={form.startDate ? new Date(form.startDate) : null}
                    onChange={handleStartDateChange}
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select start date"
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={form.endDate ? new Date(form.endDate) : null}
                    onChange={handleEndDateChange}
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select end date"
                    minDate={form.startDate ? new Date(form.startDate) : null}
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    rows="3"
                  />
                </div>
              </form>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateHoliday}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                >
                  Update Holiday
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* View Holiday Modal */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View Holiday
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Holiday Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.name} ({formatDateToShort(form.startDate)})
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Start Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatDateToReadable(form.startDate)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    End Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatDateToReadable(form.endDate || form.startDate)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Description
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 min-h-[80px]">
                    {form.description?.trim()
                      ? form.description
                      : "No Description"}
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
    </div>
  );
};

export default Holidays;