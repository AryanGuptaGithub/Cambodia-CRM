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
const upcomingHolidaysPerPage = 4;

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
  
  // Upcoming holidays pagination - CHANGED: Now per month
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

  const filteredHolidays = holidays.filter(
    (r) =>
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.startDate && r.startDate.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Get upcoming holidays for CURRENT MONTH only (excluding Sundays)
  const currentMonthHolidays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get start and end of current month
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    return holidays
      .filter((holiday) => {
        if (!holiday.startDate) return false;
        const holidayDate = new Date(holiday.startDate);
        holidayDate.setHours(0, 0, 0, 0);
        
        // Exclude Sundays and past holidays, include only current month
        return holidayDate >= today && 
               holidayDate <= endOfMonth && 
               holidayDate.getDay() !== 0;
      })
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [holidays, currentMonth, currentYear]);

  // Get holidays for NEXT MONTH (for navigation)
  const nextMonthHolidays = useMemo(() => {
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    
    const startOfNextMonth = new Date(nextMonthYear, nextMonth, 1);
    const endOfNextMonth = new Date(nextMonthYear, nextMonth + 1, 0);
    endOfNextMonth.setHours(23, 59, 59, 999);

    return holidays
      .filter((holiday) => {
        if (!holiday.startDate) return false;
        const holidayDate = new Date(holiday.startDate);
        holidayDate.setHours(0, 0, 0, 0);
        
        return holidayDate >= startOfNextMonth && 
               holidayDate <= endOfNextMonth && 
               holidayDate.getDay() !== 0;
      })
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [holidays, currentMonth, currentYear]);

  // Pagination for current month holidays
  const currentMonthHolidaysTotalPages = Math.ceil(currentMonthHolidays.length / upcomingHolidaysPerPage);
  const currentMonthHolidaysToShow = currentMonthHolidays.slice(
    (upcomingHolidaysPage - 1) * upcomingHolidaysPerPage,
    upcomingHolidaysPage * upcomingHolidaysPerPage
  );

  const nextUpcomingHolidaysPage = () => {
    if (upcomingHolidaysPage < currentMonthHolidaysTotalPages) {
      setUpcomingHolidaysPage(prev => prev + 1);
    }
  };

  const prevUpcomingHolidaysPage = () => {
    if (upcomingHolidaysPage > 1) {
      setUpcomingHolidaysPage(prev => prev - 1);
    }
  };

  // Reset pagination when month changes
  useEffect(() => {
    setUpcomingHolidaysPage(1);
  }, [currentMonth, currentYear]);

  // Group current month holidays by week for better organization
  const currentMonthHolidaysByWeek = useMemo(() => {
    const grouped = {};
    currentMonthHolidaysToShow.forEach(holiday => {
      if (!holiday.startDate) return;
      const date = new Date(holiday.startDate);
      const weekNumber = Math.ceil(date.getDate() / 7);
      const weekKey = `Week ${weekNumber}`;
      
      if (!grouped[weekKey]) {
        grouped[weekKey] = [];
      }
      grouped[weekKey].push(holiday);
    });
    return grouped;
  }, [currentMonthHolidaysToShow]);

  // Pagination calculations for main table
  const totalPages = Math.ceil(filteredHolidays.length / holidaysPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentHolidays = filteredHolidays.slice(
    (currentPage - 1) * holidaysPerPage,
    currentPage * holidaysPerPage
  );

  function getVisiblePages(currentPage, totalPages) {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) {
      return [1, 2, 3, "...", totalPages];
    }
    if (currentPage >= totalPages - 2) {
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, "...", currentPage, "...", totalPages];
  }

  // Select/unselect a holiday by id
  const toggleSelect = (holiday) => {
    setSelected((prev) => {
      const exists = prev.some((h) => h.id === holiday._id);
      if (exists) {
        return prev.filter((h) => h.id !== holiday._id);
      } else {
        return [...prev, { id: holiday._id, name: holiday.name }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentHolidays.map((s) => ({
        id: s._id,
        name: s.name,
      }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> holidays`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/holidays`, {
          data: { ids: selected.map(s => s.id) },
        });

        if (res.status === 200) {
          showToast("success", "Selected holidays deleted successfully");
          fetchHolidays();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected holidays.");
      }
    } else {
      setSelected([]);
    }
  };

  // Open edit modal with selected holiday data
  const editHoliday = (holiday) => {
    setForm({ 
      ...holiday,
      startDate: holiday.startDate || "",
      endDate: holiday.endDate || holiday.startDate || ""
    });
    setIsEditModalOpen(true);
  };

  // Open view modal with selected holiday data
  const handleView = (holiday) => {
    setForm({ 
      ...holiday,
      startDate: holiday.startDate || "",
      endDate: holiday.endDate || holiday.startDate || ""
    });
    setIsViewModalOpen(true);
  };

  const deleteHoliday = async (holiday) => {
    if (!holiday._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${holiday.name}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/holidays/${holiday._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            `Holiday <b>${holiday.name}</b> deleted successfully`
          );
          fetchHolidays();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete holiday.");
      }
    }
  };

  // Add holiday from calendar with proper date format
  const handleCalendarDateClick = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;
    
    // Check if holiday already exists for this date
    const existingHoliday = holidays.find((h) => {
      if (!h.startDate) return false;
      const holidayDate = new Date(h.startDate);
      const holidayDateString = holidayDate.toISOString().split("T")[0];
      return holidayDateString === dateString;
    });

    if (existingHoliday) {
      setForm({ 
        ...existingHoliday,
        startDate: existingHoliday.startDate || "",
        endDate: existingHoliday.endDate || existingHoliday.startDate || ""
      });
      setIsViewModalOpen(true);
    } else {
      const isoDateString = `${dateString}T00:00:00.000Z`;
      setForm({
        startDate: isoDateString,
        endDate: isoDateString,
        name: "",
        description: "",
        _id: null,
      });
      setIsAddModalOpen(true);
    }
  };

  // Handle add holiday with proper date format
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    try {
      // Validate form
      if (!form.name || !form.startDate) {
        showToast("error", "Please fill in all required fields");
        return;
      }

      // Ensure end date is not before start date
      const startDate = new Date(form.startDate);
      const endDate = new Date(form.endDate || form.startDate);
      
      if (endDate < startDate) {
        showToast("error", "End date cannot be before start date");
        return;
      }

      const payload = {
        name: form.name,
        description: form.description,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
      };

      const res = await axios.post(`${backendUrl}/api/holidays`, payload);
      if (res.status === 201) {
        showToast("success", `Holiday <b>${form.name}</b> added successfully`);
        setIsAddModalOpen(false);
        setForm({
          startDate: "",
          endDate: "",
          name: "",
          description: "",
          _id: null,
        });
        fetchHolidays();
      }
    } catch (err) {
      console.error('Add holiday error:', err);
      showToast("error", err.response?.data?.message || "Failed to add holiday.");
    }
  };

  // Update holiday with proper date handling
  const handleUpdateHoliday = async (e) => {
    e.preventDefault();
    try {
      if (!form.name || !form.startDate) {
        showToast("error", "Please fill in all required fields");
        return;
      }

      const startDate = new Date(form.startDate);
      const endDate = new Date(form.endDate || form.startDate);
      
      if (endDate < startDate) {
        showToast("error", "End date cannot be before start date");
        return;
      }

      const payload = {
        name: form.name,
        description: form.description,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
      };

      const res = await axios.put(
        `${backendUrl}/api/holidays/${form._id}`,
        payload
      );
      if (res.status === 200) {
        showToast(
          "success",
          `Holiday <b>${form.name}</b> updated successfully`
        );
        setIsEditModalOpen(false);
        fetchHolidays();
      }
    } catch (err) {
      console.error('Update holiday error:', err);
      showToast("error", err.response?.data?.message || "Failed to update holiday.");
    }
  };

  // DatePicker change handlers - FIXED
  const handleStartDateChange = (date) => {
    if (date) {
      // Create date in local timezone but store as UTC
      const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const isoDateString = localDate.toISOString();
      
      setForm(prev => ({ 
        ...prev, 
        startDate: isoDateString,
        // If end date is not set or is before start date, update end date
        endDate: !prev.endDate || new Date(prev.endDate) < date ? isoDateString : prev.endDate
      }));
    } else {
      setForm(prev => ({ ...prev, startDate: "" }));
    }
  };

  const handleEndDateChange = (date) => {
    if (date) {
      const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const isoDateString = localDate.toISOString();
      setForm(prev => ({ ...prev, endDate: isoDateString }));
    } else {
      setForm(prev => ({ ...prev, endDate: "" }));
    }
  };

  const handlerEnabledHoliday = async (id) => {
    try {
      const holiday = holidays.find((h) => h._id === id);
      if (!holiday) return;
      const updatedHoliday = { ...holiday, enabled: !holiday.enabled };
      const response = await fetch(`${backendUrl}/api/holidays/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: updatedHoliday.enabled }),
      });

      if (!response.ok) throw new Error("Failed to update holiday");

      const data = await response.json();
      setHolidays((prev) =>
        prev.map((h) => (h._id === id ? { ...h, enabled: data.enabled } : h))
      );
    } catch (err) {
      console.error("Error updating holiday:", err);
      showToast("error", "Failed to update holiday status");
    }
  };

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.classList.remove("highlight");
        }
      }, 1000);
    }
  };

  // File upload and parsing logic for import - UPDATED
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });

      if (rows.length === 0) {
        showToast("warning", "Excel file is empty");
        return;
      }

      // Expected headers
      const requiredHeaders = ["start date", "end date", "name", "description"];

      let headerRowIndex = -1;
      let matchedHeaders = [];

      // Find header row
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map((cell) =>
          cell?.toString().trim().toLowerCase()
        );
        const matched = requiredHeaders.filter((header) =>
          row.includes(header)
        );
        if (matched.length >= 2) {
          headerRowIndex = i;
          matchedHeaders = matched;
          break;
        }
      }

      if (headerRowIndex === -1 || matchedHeaders.length < requiredHeaders.length) {
        const missingHeaders = requiredHeaders.filter(
          (header) => !matchedHeaders.includes(header)
        );
        showToast("error", `Missing required headers: ${missingHeaders.join(", ")}`);
        return;
      }

      // Map header keys to column indexes
      const rawHeaders = rows[headerRowIndex];
      const headersMap = {};
      rawHeaders.forEach((header, index) => {
        if (!header) return;
        const cleaned = header.toString().trim().toLowerCase();
        headersMap[index] = cleaned;
      });

      // Parse data rows
      const dataRows = rows.slice(headerRowIndex + 1);
      if (dataRows.length === 0) {
        showToast("warning", "No data found in Excel file");
        return;
      }

      const mappedData = dataRows
        .map((row, rowIndex) => {
          const item = {};
          Object.entries(headersMap).forEach(([index, key]) => {
            item[key] = row[index] || "";
          });

          // Parse dates
          const startDate = parseExcelDate(item["start date"]);
          const endDate = parseExcelDate(item["end date"]) || startDate;

          if (!startDate) {
            console.warn(`Invalid start date in row ${rowIndex + 1}`);
            return null;
          }

          return {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            name: item["name"]?.toString().trim(),
            description: item["description"]?.toString().trim() || "",
          };
        })
        .filter(entry => entry && entry.name);

      if (mappedData.length === 0) {
        showToast("warning", "No valid holiday data found in file");
        return;
      }

      setParsedData(mappedData);
      showToast("success", `Found ${mappedData.length} valid holidays to import`);
    };

    reader.onerror = () => {
      showToast("error", "Error reading file");
    };

    reader.readAsArrayBuffer(file);
  };

  // Parse Excel date function - IMPROVED
  const parseExcelDate = (value) => {
    if (!value) return null;

    // If it's an Excel serial number
    if (typeof value === "number") {
      // Excel date (number of days since 1900-01-01)
      const utcDate = new Date(Math.round((value - 25569) * 86400 * 1000));
      return new Date(utcDate.getFullYear(), utcDate.getMonth(), utcDate.getDate());
    }

    // Try parsing as date string
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    return null;
  };

  // Import parsed holidays to backend
  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }
    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/holidays/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Holidays imported successfully!"
        );
        setShowImportModal(false);
        setParsedData([]);
        fetchHolidays();
      }
    } catch (err) {
      console.error("Import error:", err);
      const errorMessage = err.response?.data?.message || "Failed to import holidays.";
      showToast("error", errorMessage.replace(/<[^>]+>/g, ""));
    } finally {
      setIsUploading(false);
    }
  };

  // Calendar view functions
  const isSunday = (date) => {
    return date.getDay() === 0;
  };

  const isHoliday = (date) => {
    const dateString = date.toISOString().split("T")[0];
    return holidays.some((holiday) => {
      if (!holiday.startDate) return false;
      const holidayStart = new Date(holiday.startDate);
      const holidayEnd = new Date(holiday.endDate || holiday.startDate);
      
      const holidayStartString = holidayStart.toISOString().split("T")[0];
      const holidayEndString = holidayEnd.toISOString().split("T")[0];
      
      return dateString >= holidayStartString && dateString <= holidayEndString;
    });
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

  const getHolidayName = (dateString) => {
    const holiday = holidays.find((h) => {
      if (!h.startDate) return false;
      const holidayStart = new Date(h.startDate);
      const holidayEnd = new Date(h.endDate || h.startDate);
      
      const holidayStartString = holidayStart.toISOString().split("T")[0];
      const holidayEndString = holidayEnd.toISOString().split("T")[0];
      
      return dateString >= holidayStartString && dateString <= holidayEndString;
    });
    return holiday ? holiday.name : "";
  };

  // Render monthly calendar
  const renderMonthlyCalendar = () => {
    const days = getDaysInMonth();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const hasNextMonthHolidays = nextMonthHolidays.length > 0;

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        {/* Calendar Header */}
        <div className="flex justify-between items-center mb-6">
          {/* Upcoming Holidays Section - CHANGED: Only current month */}
          <div className="flex-1 max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                {monthNames[currentMonth]} {currentYear} Holidays
                {currentMonthHolidays.length > 0 && (
                  <span className="text-sm font-normal text-gray-600 ml-2">
                    ({currentMonthHolidays.length} holiday{currentMonthHolidays.length !== 1 ? 's' : ''})
                  </span>
                )}
              </h3>
              
              {/* Pagination only shown if more than 3 holidays in current month */}
              {currentMonthHolidays.length > upcomingHolidaysPerPage && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={prevUpcomingHolidaysPage}
                    disabled={upcomingHolidaysPage === 1}
                    className={`p-2 rounded-lg border ${
                      upcomingHolidaysPage === 1
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer border-gray-300"
                    }`}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  
                  <span className="text-sm font-medium text-gray-600 min-w-[80px] text-center">
                    Page {upcomingHolidaysPage} of {currentMonthHolidaysTotalPages}
                  </span>
                  
                  <button
                    onClick={nextUpcomingHolidaysPage}
                    disabled={upcomingHolidaysPage === currentMonthHolidaysTotalPages}
                    className={`p-2 rounded-lg border ${
                      upcomingHolidaysPage === currentMonthHolidaysTotalPages
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer border-gray-300"
                    }`}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Current Month Holidays List */}
            <div className="space-y-3">
              {currentMonthHolidaysToShow.length > 0 ? (
                Object.entries(currentMonthHolidaysByWeek).map(([weekKey, weekHolidays]) => (
                  <div key={weekKey} className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">
                      {weekKey}
                    </h4>
                    <div className="space-y-2">
                      {weekHolidays.map((holiday) => (
                        <div
                          key={holiday._id}
                          className="bg-blue-50 border border-blue-200 rounded-lg p-3 hover:bg-blue-100 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium text-blue-800 text-sm">
                                {holiday.name}
                              </div>
                              <div className="text-blue-600 text-xs mt-1">
                                {formatDateToReadable(holiday.startDate)}
                                {holiday.endDate && holiday.endDate !== holiday.startDate && 
                                  ` to ${formatDateToReadable(holiday.endDate)}`
                                }
                              </div>
                            </div>
                            {holiday.description && (
                              <div className="text-xs text-blue-500 max-w-[120px] truncate" title={holiday.description}>
                                {holiday.description}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <Calendar size={24} className="mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No holidays in {monthNames[currentMonth]} {currentYear}</p>
                </div>
              )}
            </div>

            {/* Next Month Preview */}
            {hasNextMonthHolidays && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-green-800">
                    Next Month Preview
                  </h4>
                  <button
                    onClick={nextMonth}
                    className="text-green-600 hover:text-green-800 text-sm font-medium flex items-center gap-1 cursor-pointer"
                  >
                    View {monthNames[currentMonth === 11 ? 0 : currentMonth + 1]} {currentMonth === 11 ? currentYear + 1 : currentYear}
                    <ChevronRight size={14} />
                  </button>
                </div>
                <p className="text-xs text-green-600">
                  {nextMonthHolidays.length} holiday{nextMonthHolidays.length !== 1 ? 's' : ''} in {monthNames[currentMonth === 11 ? 0 : currentMonth + 1]}
                </p>
              </div>
            )}
          </div>

          {/* Calendar Navigation */}
          <div className="flex gap-3 items-center">
            <button
              onClick={prevMonth}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-xl font-bold text-gray-800 min-w-[200px] text-center">
              {monthNames[currentMonth]} {currentYear}
            </h2>
            <button
              onClick={nextMonth}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
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

            const isHolidayDay = isHoliday(date);
            const isSundayDay = isSunday(date);
            const isCurrentMonth = date.getMonth() === currentMonth;
            const isToday = date.toDateString() === new Date().toDateString();
            const holidayName = getHolidayName(date.toISOString().split("T")[0]);

            return (
              <div
                key={date.toISOString()}
                className={`h-12 flex items-center justify-center rounded-lg border-2 cursor-pointer transition-all ${
                  isHolidayDay || isSundayDay
                    ? "bg-red-500 text-white border-red-600"
                    : isToday
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                } ${!isCurrentMonth ? "opacity-40" : ""}`}
                onClick={() => handleCalendarDateClick(date)}
                title={holidayName || (isSundayDay ? "Sunday" : "")}
              >
                {date.getDate()}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render annual calendar with current month focus
  const renderAnnualCalendar = () => {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        {/* Annual Calendar Header */}
        <div className="flex justify-between items-center mb-6">
          {/* Current Month Holidays Section */}
          <div className="flex-1 max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                {monthNames[currentMonth]} {currentYear} Holidays
                {currentMonthHolidays.length > 0 && (
                  <span className="text-sm font-normal text-gray-600 ml-2">
                    ({currentMonthHolidays.length} holiday{currentMonthHolidays.length !== 1 ? 's' : ''})
                  </span>
                )}
              </h3>
              
              {currentMonthHolidays.length > upcomingHolidaysPerPage && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={prevUpcomingHolidaysPage}
                    disabled={upcomingHolidaysPage === 1}
                    className={`p-2 rounded-lg border ${
                      upcomingHolidaysPage === 1
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer border-gray-300"
                    }`}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  
                  <span className="text-sm font-medium text-gray-600 min-w-[80px] text-center">
                    Page {upcomingHolidaysPage} of {currentMonthHolidaysTotalPages}
                  </span>
                  
                  <button
                    onClick={nextUpcomingHolidaysPage}
                    disabled={upcomingHolidaysPage === currentMonthHolidaysTotalPages}
                    className={`p-2 rounded-lg border ${
                      upcomingHolidaysPage === currentMonthHolidaysTotalPages
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer border-gray-300"
                    }`}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Current Month Holidays List */}
            <div className="space-y-3">
              {currentMonthHolidaysToShow.length > 0 ? (
                Object.entries(currentMonthHolidaysByWeek).map(([weekKey, weekHolidays]) => (
                  <div key={weekKey} className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">
                      {weekKey}
                    </h4>
                    <div className="space-y-2">
                      {weekHolidays.map((holiday) => (
                        <div
                          key={holiday._id}
                          className="bg-blue-50 border border-blue-200 rounded-lg p-3 hover:bg-blue-100 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium text-blue-800 text-sm">
                                {holiday.name}
                              </div>
                              <div className="text-blue-600 text-xs mt-1">
                                {formatDateToReadable(holiday.startDate)}
                                {holiday.endDate && holiday.endDate !== holiday.startDate && 
                                  ` to ${formatDateToReadable(holiday.endDate)}`
                                }
                              </div>
                            </div>
                            {holiday.description && (
                              <div className="text-xs text-blue-500 max-w-[120px] truncate" title={holiday.description}>
                                {holiday.description}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <Calendar size={24} className="mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No holidays in {monthNames[currentMonth]} {currentYear}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <button
              onClick={prevYear}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-xl font-bold text-gray-800 min-w-[100px] text-center">
              {currentYear}
            </h2>
            <button
              onClick={nextYear}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Annual Calendar Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {monthNames.map((monthName, monthIndex) => {
            const monthDays = getDaysInMonth(currentYear, monthIndex);
            const isCurrentMonth = monthIndex === currentMonth;

            return (
              <div
                key={monthName}
                className={`border rounded-lg p-4 ${
                  isCurrentMonth 
                    ? "border-blue-500 bg-blue-50 shadow-md" 
                    : "border-gray-200 bg-white"
                }`}
              >
                <h3 className={`text-lg font-semibold text-center mb-3 ${
                  isCurrentMonth ? "text-blue-800" : "text-gray-800"
                }`}>
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

                    const isHolidayDay = isHoliday(date);
                    const isSundayDay = isSunday(date);
                    const isToday = date.toDateString() === new Date().toDateString();

                    return (
                      <div
                        key={date.toISOString()}
                        className={`h-6 flex items-center justify-center rounded text-xs cursor-pointer ${
                          isHolidayDay
                            ? "bg-red-500 text-white"
                            : isSundayDay
                            ? "bg-red-500 text-white"
                            : isToday
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100"
                        } ${isCurrentMonth ? "border border-blue-200" : ""}`}
                        title={getHolidayName(date.toISOString().split("T")[0])}
                        onClick={() => handleCalendarDateClick(date)}
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

  if (loading) return <div className="p-6 text-center">Loading...</div>;
  if (error) return <div className="p-6 text-red-500 text-center">{error}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={() => setIsAddModalOpen(true)}
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

        {!showCalendarView && (
          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {filteredHolidays.length}
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
                <span>Holiday & Sunday</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-50 rounded border-2 border-gray-200"></div>
                <span>Working Day</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-50 rounded border-2 border-blue-500"></div>
                <span>Today</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-100 rounded border-2 border-blue-300"></div>
                <span>Current Month</span>
              </div>
            </div>

            <div className="w-24"></div>
          </div>

          {/* Calendar Display */}
          {calendarViewType === "monthly"
            ? renderMonthlyCalendar()
            : renderAnnualCalendar()}
        </>
      ) : (
        /* Table View */
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3 text-sm font-medium">
                  <div className="flex items-center gap-4">
                    {currentHolidays.length > 0 && (
                      <input
                        type="checkbox"
                        checked={
                          selected.length === currentHolidays.length &&
                          currentHolidays.length > 0
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    )}
                    <span>Holiday Name</span>
                  </div>
                </th>
                <th className="p-3 text-sm font-medium">Start Date</th>
                <th className="p-3 text-sm font-medium">End Date</th>
                <th className="p-3 text-sm font-medium">Description</th>
                <th className="p-3 text-sm font-medium">Status</th>
                <th className="p-3 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentHolidays.length > 0 ? (
                currentHolidays.map((holiday, index) => (
                  <tr
                    key={holiday._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % holidaysPerPage === 0 ||
                      index + 1 === currentHolidays.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === holiday._id)}
                          onChange={() => toggleSelect(holiday)}
                        />
                        <span className="capitalize">{holiday.name}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      {formatDateToReadable(holiday.startDate)}
                    </td>
                    <td className="p-3">
                      {formatDateToReadable(holiday.endDate || holiday.startDate)}
                    </td>
                    <td className="p-3 capitalize">
                      {holiday.description || "No description"}
                    </td>
                    <td>
                      <button
                        onClick={() => handlerEnabledHoliday(holiday._id)}
                        className={`px-3 py-1 rounded-full text-sm cursor-pointer ${
                          holiday.enabled
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {holiday.enabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button 
                        onClick={() => handleView(holiday)}
                        className="text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        <Eye size={18} />
                      </button>
                      <button 
                        onClick={() => editHoliday(holiday)}
                        className="text-green-600 hover:text-green-800 cursor-pointer"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => deleteHoliday(holiday)}
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-3 text-center">
                    No holiday records found
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

      {/* Import Modal */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !isUploading && setShowImportModal(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => !isUploading && setShowImportModal(false)}
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
                <label className="block text-gray-700 mb-2">Upload Excel File</label>
                <input
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
              onClick={() => setIsAddModalOpen(false)}
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
                    Holiday Name *
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
                  <label className="block text-sm font-medium">Start Date *</label>
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
                  <label className="block text-sm font-medium">End Date *</label>
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
              onClick={() => setIsEditModalOpen(false)}
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
                    Holiday Name *
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
                  <label className="block text-sm font-medium">Start Date *</label>
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
                  <label className="block text-sm font-medium">End Date *</label>
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
                View Holiday
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Holiday Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.name}
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