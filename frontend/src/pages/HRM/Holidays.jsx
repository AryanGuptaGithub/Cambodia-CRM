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
  Menu,
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
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const holidaysPerPage = 7;

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

  // Mobile states
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Detect mobile view
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${backendUrl}/api/hrm/holidays`);
      if (response.data && response.data.success !== false) {
        const holidaysData =
          response.data.holidays || response.data.data || response.data;
        if (Array.isArray(holidaysData)) {
          setHolidays(holidaysData);
        } else {
          console.warn("⚠️ Holidays data is not an array:", holidaysData);
          setHolidays([]);
        }
      } else {
        console.error("❌ API returned error:", response.data);
        setHolidays([]);
      }
    } catch (err) {
      console.error("❌ fetchHolidays error:", err);
      setError(err.message || "Failed to fetch holidays");
      setHolidays([]);
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
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = date.toLocaleString("default", { month: "short" });
    const year = date.getUTCFullYear();
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
        holiday.yearCode.includes(currentYearString),
    );
  }, [holidays, currentYearString]);

  // For calendar, filter holidays by the selected year
  const currentYearCalendarHolidays = useMemo(() => {
    const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
    const endOfYear = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));

    return holidays
      .filter((holiday) => {
        if (!holiday.startDate) return false;

        const holidayStart = new Date(holiday.startDate);
        const holidayEnd = new Date(holiday.endDate || holiday.startDate);

        // Reset to UTC for comparison
        const holidayStartUTC = new Date(Date.UTC(
          holidayStart.getUTCFullYear(),
          holidayStart.getUTCMonth(),
          holidayStart.getUTCDate()
        ));
        const holidayEndUTC = new Date(Date.UTC(
          holidayEnd.getUTCFullYear(),
          holidayEnd.getUTCMonth(),
          holidayEnd.getUTCDate()
        ));

        // Check if holiday overlaps with the selected year
        return holidayStartUTC <= endOfYear && holidayEndUTC >= startOfYear;
      })
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [holidays, currentYear]);

  const filteredHolidays = currentYearHolidays.filter(
    (r) =>
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.startDate &&
        r.startDate.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  // Calendar view functions - FIXED with UTC
  const isSunday = (date) => {
    return date.getUTCDay() === 0;
  };

  const isHoliday = (date) => {
    if (!date) return false;
    
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;
    
    return currentYearCalendarHolidays.some((holiday) => {
      if (!holiday.startDate) return false;
      const holidayStart = new Date(holiday.startDate);
      const holidayEnd = new Date(holiday.endDate || holiday.startDate);
      
      const holidayStartString = `${holidayStart.getUTCFullYear()}-${String(holidayStart.getUTCMonth() + 1).padStart(2, "0")}-${String(holidayStart.getUTCDate()).padStart(2, "0")}`;
      const holidayEndString = `${holidayEnd.getUTCFullYear()}-${String(holidayEnd.getUTCMonth() + 1).padStart(2, "0")}-${String(holidayEnd.getUTCDate()).padStart(2, "0")}`;
      
      return dateString >= holidayStartString && dateString <= holidayEndString;
    });
  };

  const getHolidayName = (dateParam) => {
    let searchDateString;
    
    if (dateParam instanceof Date) {
      const year = dateParam.getUTCFullYear();
      const month = String(dateParam.getUTCMonth() + 1).padStart(2, "0");
      const day = String(dateParam.getUTCDate()).padStart(2, "0");
      searchDateString = `${year}-${month}-${day}`;
    } else {
      searchDateString = dateParam;
    }
    
    const holiday = currentYearCalendarHolidays.find((h) => {
      if (!h.startDate) return false;
      const holidayStart = new Date(h.startDate);
      const holidayEnd = new Date(h.endDate || h.startDate);
      
      const holidayStartString = `${holidayStart.getUTCFullYear()}-${String(holidayStart.getUTCMonth() + 1).padStart(2, "0")}-${String(holidayStart.getUTCDate()).padStart(2, "0")}`;
      const holidayEndString = `${holidayEnd.getUTCFullYear()}-${String(holidayEnd.getUTCMonth() + 1).padStart(2, "0")}-${String(holidayEnd.getUTCDate()).padStart(2, "0")}`;
      
      return searchDateString >= holidayStartString && searchDateString <= holidayEndString;
    });
    return holiday ? holiday.name : "";
  };

  const getDaysInMonth = (year = currentYear, month = currentMonth) => {
    const days = [];
    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    
    const firstDayOfWeek = firstDay.getUTCDay();
    
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let i = 1; i <= lastDay.getUTCDate(); i++) {
      days.push(new Date(Date.UTC(year, month, i)));
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

  // Calendar date click - FIXED with UTC
  const handleCalendarDateClick = (date) => {
    if (!date) return;
    
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    const existingHoliday = currentYearCalendarHolidays.find((h) => {
      if (!h.startDate) return false;
      const holidayStart = new Date(h.startDate);
      const holidayEnd = new Date(h.endDate || h.startDate);
      
      const holidayStartString = `${holidayStart.getUTCFullYear()}-${String(holidayStart.getUTCMonth() + 1).padStart(2, "0")}-${String(holidayStart.getUTCDate()).padStart(2, "0")}`;
      const holidayEndString = `${holidayEnd.getUTCFullYear()}-${String(holidayEnd.getUTCMonth() + 1).padStart(2, "0")}-${String(holidayEnd.getUTCDate()).padStart(2, "0")}`;
      
      return dateString >= holidayStartString && dateString <= holidayEndString;
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

  const handleAddButtonClick = () => {
    setIsAddModalOpen(true);
    setForm({
      startDate: "",
      endDate: "",
      name: "",
      description: "",
      _id: null,
    });
    setMobileMenuOpen(false);
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
        const res = await axios.delete(`${backendUrl}/api/hrm/holidays`, {
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
    setMobileMenuOpen(false);
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
        const res = await axios.delete(
          `${backendUrl}/api/hrm/holidays/${holiday._id}`,
        );
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

        const expectedHeaders = [
          "Holiday Name",
          "Start Date",
          "End Date",
          "Description",
        ];
        let headerIdx = -1;

        for (let i = 0; i < rows.length; i++) {
          if (!rows[i] || !Array.isArray(rows[i])) continue;

          const row = rows[i].map((c) => c?.toString().trim() || "");
          const normalized = row.map((c) => c.toLowerCase());

          let matchCount = 0;
          expectedHeaders.forEach((h) => {
            if (normalized.includes(h.toLowerCase())) {
              matchCount++;
            }
          });

          if (matchCount >= 2) {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx === -1) {
          showToast(
            "error",
            "Could not find holiday data in the Excel file. Please check the format.",
          );
          return;
        }

        const headers = rows[headerIdx].map((h) => h?.toString().trim() || "");
        const dataRows = rows.slice(headerIdx + 1);

        const json = dataRows.map((row) => {
          const obj = {};
          headers.forEach((h, i) => {
            obj[h] = row && row[i] !== undefined ? row[i] : "";
          });
          return obj;
        });

        const finalData = json
          .filter((item) => {
            const holidayName =
              item["Holiday Name"] ||
              item["HolidayName"] ||
              item["Holiday name"];
            const startDate =
              item["Start Date"] || item["StartDate"] || item["Start date"];
            return holidayName && startDate;
          })
          .map((item) => {
            const holidayName =
              item["Holiday Name"] ||
              item["HolidayName"] ||
              item["Holiday name"] ||
              "";
            let startDate =
              item["Start Date"] ||
              item["StartDate"] ||
              item["Start date"] ||
              "";
            let endDate =
              item["End Date"] ||
              item["EndDate"] ||
              item["End date"] ||
              startDate;
            const description = item["Description"] || "";

            const parseExcelDate = (dateValue) => {
              if (!dateValue) return null;
              if (typeof dateValue === "string") {
                if (dateValue.includes(" ")) {
                  return dateValue.split(" ")[0];
                }
                return dateValue;
              }
              if (typeof dateValue === "number") {
                const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                const millisecondsPerDay = 24 * 60 * 60 * 1000;
                const jsDate = new Date(
                  excelEpoch.getTime() + dateValue * millisecondsPerDay,
                );
                const year = jsDate.getUTCFullYear();
                const month = String(jsDate.getUTCMonth() + 1).padStart(2, "0");
                const day = String(jsDate.getUTCDate()).padStart(2, "0");
                return `${year}-${month}-${day}`;
              }
              return null;
            };

            const formattedStartDate = parseExcelDate(startDate);
            const formattedEndDate =
              endDate === startDate
                ? formattedStartDate
                : parseExcelDate(endDate);

            return {
              startDate: formattedStartDate,
              endDate: formattedEndDate,
              name: holidayName,
              description: description,
            };
          })
          .filter((item) => item.startDate && item.endDate);

        if (finalData.length === 0) {
          showToast(
            "warning",
            "No valid holiday data found in the file. Please check the format.",
          );
          return;
        }

        setParsedData(finalData);
      } catch (error) {
        console.error("Error reading file:", error);
        showToast(
          "error",
          "Failed to process Excel file. Please check the format.",
        );
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
      const res = await axios.post(
        `${backendUrl}/api/hrm/holidays/import`,
        parsedData,
      );
      if (res.status === 200 || res.status === 201) {
        showToast("success", "Holidays imported successfully");
        setShowImportModal(false);
        setParsedData([]);
        fetchHolidays();
      }
    } catch (err) {
      console.error("Import error:", err);
      showToast(
        "error",
        err.response?.data?.message || "Failed to import holidays",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartDateChange = (date) => {
    if (date) {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      setForm((prev) => ({
        ...prev,
        startDate: `${year}-${month}-${day}`,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        startDate: "",
      }));
    }
  };

  const handleEndDateChange = (date) => {
    if (date) {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      setForm((prev) => ({
        ...prev,
        endDate: `${year}-${month}-${day}`,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        endDate: "",
      }));
    }
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

      const res = await axios.post(`${backendUrl}/api/hrm/holidays`, payload);
      if (res.status === 201 || res.status === 200) {
        showToast("success", "Holiday added successfully");
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
      console.error("Add holiday error:", err);
      showToast(
        "error",
        err.response?.data?.message || "Failed to add holiday",
      );
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

      const res = await axios.put(
        `${backendUrl}/api/hrm/holidays/${form._id}`,
        payload,
      );
      if (res.status === 200) {
        showToast("success", "Holiday updated successfully");
        setIsEditModalOpen(false);
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
      console.error("Update holiday error:", err);
      showToast(
        "error",
        err.response?.data?.message || "Failed to update holiday",
      );
    }
  };

  const getHolidaysForMonth = (monthIndex) => {
    return currentYearCalendarHolidays.filter((holiday) => {
      if (!holiday.startDate) return false;

      const holidayStart = new Date(holiday.startDate);
      const holidayEnd = new Date(holiday.endDate || holiday.startDate);

      const startOfMonth = new Date(Date.UTC(currentYear, monthIndex, 1));
      const endOfMonth = new Date(Date.UTC(currentYear, monthIndex + 1, 0, 23, 59, 59, 999));

      return holidayStart <= endOfMonth && holidayEnd >= startOfMonth;
    });
  };

  // Monthly Calendar Component - FIXED with UTC
  const renderMonthlyCalendar = () => {
    const days = getDaysInMonth();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    const todayUTC = new Date(Date.UTC(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ));

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-3 md:p-6">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <ChevronLeft size={isMobileView ? 18 : 20} />
          </button>
          <h2 className="text-base md:text-xl font-semibold">
            {monthNames[currentMonth]} {currentYear}
          </h2>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <ChevronRight size={isMobileView ? 18 : 20} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 md:gap-1 mb-2">
          {dayNames.map((day) => (
            <div
              key={day}
              className="p-1 md:p-2 text-center font-medium text-gray-600 text-[10px] md:text-sm"
            >
              {isMobileView ? day.charAt(0) : day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5 md:gap-1">
          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="p-1 md:p-2" />;
            }

            const isCurrentMonth = date.getUTCMonth() === currentMonth;
            const isToday = date.getTime() === todayUTC.getTime();
            const isHolidayDate = isHoliday(date);
            const isSundayDate = isSunday(date);
            const holidayName = getHolidayName(date);

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
                key={`${currentYear}-${currentMonth}-${date.getUTCDate()}`}
                onClick={() => handleCalendarDateClick(date)}
                className={`min-h-[25px] md:min-h-[50px] p-1 md:p-2 border rounded-lg cursor-pointer transition-all hover:shadow-md ${bgColor} ${borderColor} ${textColor} ${
                  !isCurrentMonth ? "opacity-50" : ""
                }`}
              >
                <div className="flex justify-center items-center">
                  <span
                    className={`text-xs md:text-sm font-medium ${isSundayDate || isHolidayDate ? "text-white" : "text-gray-900"}`}
                  >
                    {date.getUTCDate()}
                  </span>
                </div>
                {isHolidayDate && holidayName && !isMobileView && (
                  <div className="mt-1">
                    <span className="text-[10px] md:text-xs font-medium truncate block">
                      {holidayName.length > 12
                        ? holidayName.slice(0, 10) + "..."
                        : holidayName}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        <div className="mt-4 md:mt-6 flex flex-wrap gap-2 md:gap-4 items-center justify-center text-[10px] md:text-sm bg-gray-50 rounded-lg p-2 md:p-4">
          <div className="flex items-center gap-1 md:gap-2">
            <div className="w-2 h-2 md:w-4 md:h-4 bg-red-500 rounded"></div>
            <span>Holiday</span>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <div className="w-2 h-2 md:w-4 md:h-4 bg-gray-400 rounded"></div>
            <span>Sunday</span>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <div className="w-2 h-2 md:w-4 md:h-4 bg-blue-500 rounded"></div>
            <span>Today</span>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <div className="w-2 h-2 md:w-4 md:h-4 bg-gray-100 rounded border border-gray-300"></div>
            <span>Working Day</span>
          </div>
        </div>
      </div>
    );
  };

  // Annual Calendar Component - FIXED with UTC
  const renderAnnualCalendar = () => {
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    const today = new Date();
    const currentYearToday = today.getFullYear();
    const currentMonthToday = today.getMonth();

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-3 md:p-6">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <button
            onClick={prevYear}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <ChevronLeft size={isMobileView ? 18 : 20} />
          </button>
          <h2 className="text-lg md:text-xl font-semibold">{currentYear}</h2>
          <button
            onClick={nextYear}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <ChevronRight size={isMobileView ? 18 : 20} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
          {monthNames.map((monthName, monthIndex) => {
            const monthDays = getDaysInMonth(currentYear, monthIndex);
            const isCurrentMonth =
              monthIndex === currentMonthToday &&
              currentYear === currentYearToday;
            const monthHolidays = getHolidaysForMonth(monthIndex);

            return (
              <div
                key={monthName}
                className={`border rounded-lg p-2 md:p-4 ${
                  isCurrentMonth
                    ? "border-blue-500 bg-blue-50 shadow-md"
                    : "border-gray-200 bg-white"
                }`}
              >
                <h3
                  className={`text-sm md:text-lg font-semibold text-center mb-2 md:mb-3 ${
                    isCurrentMonth ? "text-blue-800" : "text-gray-800"
                  }`}
                >
                  {monthName}
                  {isCurrentMonth && (
                    <span className="block text-[10px] md:text-xs font-normal text-blue-600 mt-0.5 md:mt-1">
                      (Current)
                    </span>
                  )}
                  {monthHolidays.length > 0 && (
                    <span className="block text-[10px] md:text-xs font-normal text-red-600 mt-0.5 md:mt-1">
                      {monthHolidays.length} holiday(s)
                    </span>
                  )}
                </h3>

                <div className="grid grid-cols-7 gap-0.5 mb-1 md:mb-2">
                  {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => (
                    <div
                      key={`${day}-${idx}`}
                      className={`text-center text-[8px] md:text-xs font-medium ${
                        idx === 0 ? "text-red-600" : "text-gray-600"
                      }`}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                  {monthDays.map((date, idx) => {
                    if (date === null) {
                      return (
                        <div key={`empty-${idx}`} className="h-4 md:h-6" />
                      );
                    }

                    const isSundayDay = isSunday(date);
                    const isHolidayDate = isHoliday(date);
                    const isToday =
                      date.getUTCFullYear() === today.getFullYear() &&
                      date.getUTCMonth() === today.getMonth() &&
                      date.getUTCDate() === today.getDate();
                    const holidayName = getHolidayName(date);

                    let cellStyle =
                      "h-4 md:h-6 flex items-center justify-center rounded text-[8px] md:text-xs cursor-pointer ";

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
                        key={`${currentYear}-${monthIndex}-${date.getUTCDate()}`}
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
                        {date.getUTCDate()}
                      </div>
                    );
                  })}
                </div>

                {monthHolidays.length > 0 && (
                  <div className="mt-2 md:mt-3 border-t pt-1 md:pt-2">
                    <div className="space-y-0.5 md:space-y-1 max-h-16 md:max-h-20 overflow-y-auto">
                      {monthHolidays
                        .slice(0, isMobileView ? 1 : 2)
                        .map((holiday, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-0.5 md:p-1 bg-red-50 rounded text-[8px] md:text-xs cursor-pointer hover:bg-red-100"
                            onClick={() => {
                              setForm(holiday);
                              setIsViewModalOpen(true);
                            }}
                          >
                            <span className="text-red-800 font-medium truncate">
                              {holiday.name.length > (isMobileView ? 10 : 15)
                                ? holiday.name.slice(0, isMobileView ? 8 : 12) +
                                  "..."
                                : holiday.name}
                            </span>
                            {!isMobileView && (
                              <span className="text-red-600 text-[8px] md:text-xs">
                                {formatDateToShort(holiday.startDate)}
                              </span>
                            )}
                          </div>
                        ))}
                      {monthHolidays.length > (isMobileView ? 1 : 2) && (
                        <div className="text-center text-[8px] md:text-xs text-gray-500">
                          +{monthHolidays.length - (isMobileView ? 1 : 2)} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 md:mt-6 flex flex-wrap gap-2 md:gap-4 items-center justify-center text-[10px] md:text-sm bg-gray-50 rounded-lg p-2 md:p-4">
          <div className="flex items-center gap-1 md:gap-2">
            <div className="w-2 h-2 md:w-4 md:h-4 bg-red-500 rounded"></div>
            <span>Holiday</span>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <div className="w-2 h-2 md:w-4 md:h-4 bg-gray-400 rounded"></div>
            <span>Sunday</span>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <div className="w-2 h-2 md:w-4 md:h-4 bg-blue-500 rounded"></div>
            <span>Today</span>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <div className="w-2 h-2 md:w-4 md:h-4 bg-gray-100 rounded border border-gray-300"></div>
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
    currentPage * holidaysPerPage,
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

  if (loading)
    return <div className="p-4 md:p-6 text-center">Loading holidays...</div>;
  if (error)
    return (
      <div className="p-4 md:p-6 text-red-500 text-center">Error: {error}</div>
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

      {/* Mobile Header with Hamburger Menu */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-1 bg-gray-200 border-gray-200 p-2 rounded-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <Calendar className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-bold text-gray-800">Holidays</h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total Records: {filteredHolidays.length}
          </div>
        </div>
      )}

      {/* Desktop Header */}
      {!isMobileView && (
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

          {!showCalendarView && holidays.length > 0 && (
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
      )}

      {/* Mobile Search and Calendar Toggle */}
      {isMobileView && !showCalendarView && holidays.length > 0 && (
        <div className="flex flex-col gap-3 mb-4">
          <div className="relative w-full">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
              size={15}
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
              className="pl-9 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200 text-sm"
            />
          </div>
          <div className="flex justify-between items-center">
            <p className="text-sm font-semibold text-gray-700">
              Total:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                {filteredHolidays.length} ({currentYearString})
              </span>
            </p>
            <button
              onClick={() => setShowCalendarView(!showCalendarView)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg shadow-md cursor-pointer text-sm"
            >
              <Calendar size={16} /> {showCalendarView ? "Table" : "Calendar"}
            </button>
          </div>
        </div>
      )}

      {isMobileView && showCalendarView && (
        <div className="flex justify-between items-center mb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setCalendarViewType("monthly")}
              className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer text-sm ${
                calendarViewType === "monthly"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCalendarViewType("annual")}
              className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer text-sm ${
                calendarViewType === "annual"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Annual
            </button>
          </div>
          <button
            onClick={() => setShowCalendarView(false)}
            className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg shadow-md cursor-pointer text-sm"
          >
            Show Table
          </button>
        </div>
      )}

      {/* Mobile FAB Menu - Only show in table view on mobile */}
      {isMobileView && !showCalendarView && (
        <div className="fixed bottom-6 right-6 z-40">
          <div className="relative">
            {mobileMenuOpen && (
              <div className="absolute bottom-16 right-0 mb-2 space-y-2">
                <button
                  onClick={handleAddButtonClick}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-lg cursor-pointer w-full justify-center text-sm"
                >
                  <Plus size={16} /> Add
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-lg cursor-pointer w-full justify-center text-sm"
                >
                  <Upload size={16} /> Import
                </button>
                {selected.length > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-lg cursor-pointer w-full justify-center text-sm"
                  >
                    <Trash2 size={16} /> Delete ({selected.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showCalendarView ? (
        <>
          {/* Desktop Calendar View Toggle and Legend */}
          {!isMobileView && (
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4 bg-white rounded-2xl shadow border border-gray-200 p-3 md:p-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setCalendarViewType("monthly")}
                  className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-medium cursor-pointer text-sm md:text-base ${
                    calendarViewType === "monthly"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setCalendarViewType("annual")}
                  className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-medium cursor-pointer text-sm md:text-base ${
                    calendarViewType === "annual"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Annual
                </button>
              </div>

              <div className="flex gap-3 md:gap-6 text-xs md:text-sm flex-wrap">
                <div className="flex items-center gap-1 md:gap-2">
                  <div className="w-3 h-3 md:w-4 md:h-4 bg-red-500 rounded border-2 border-red-600"></div>
                  <span>Holiday</span>
                </div>
                <div className="flex items-center gap-1 md:gap-2">
                  <div className="w-3 h-3 md:w-4 md:h-4 bg-gray-400 rounded border-2 border-gray-500"></div>
                  <span>Sunday</span>
                </div>
                <div className="flex items-center gap-1 md:gap-2">
                  <div className="w-3 h-3 md:w-4 md:h-4 bg-gray-50 rounded border-2 border-gray-200"></div>
                  <span>Working Day</span>
                </div>
                <div className="flex items-center gap-1 md:gap-2">
                  <div className="w-3 h-3 md:w-4 md:h-4 bg-blue-50 rounded border-2 border-blue-500"></div>
                  <span>Today</span>
                </div>
              </div>
            </div>
          )}

          {/* Calendar Display */}
          {calendarViewType === "monthly"
            ? renderMonthlyCalendar()
            : renderAnnualCalendar()}
        </>
      ) : (
        /* Table View */
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          {holidays.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 md:p-12 text-center">
              <p className="text-gray-500 text-base md:text-lg mb-4">
                No holidays found in the system
              </p>
              <p className="text-gray-400 text-sm md:text-base mb-6">
                Add your first holiday or import from a file
              </p>
            </div>
          ) : filteredHolidays.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 md:p-12 text-center">
              <p className="text-gray-500 text-base md:text-lg">
                No holidays found for {currentYearString}
              </p>
              <p className="text-gray-400 text-sm md:text-base mt-2">
                Try switching to calendar view to see all years
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
                  <thead className="bg-gray-100 text-gray-700 border-b text-sm">
                    <tr>
                      <th className="p-2 md:p-3 w-16 md:w-20">
                        <div className="flex items-center justify-center gap-1 md:gap-2">
                          {currentHolidays.length > 0 && (
                            <input
                              type="checkbox"
                              checked={
                                selected.length === currentHolidays.length &&
                                currentHolidays.length > 0
                              }
                              onChange={(e) =>
                                toggleSelectAll(e.target.checked)
                              }
                              className="cursor-pointer"
                            />
                          )}
                          <span>#</span>
                        </div>
                      </th>
                      <th className="p-2 md:p-3 text-left">
                        Holiday Name & Date
                      </th>
                      <th className="p-2 md:p-3 hidden md:table-cell">
                        End Date
                      </th>
                      <th className="p-2 md:p-3 hidden lg:table-cell">
                        Description
                      </th>
                      <th className="p-2 md:p-3 w-24 md:w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentHolidays.map((holiday, index) => {
                      const formattedStartDate = formatDateToReadable(
                        holiday.startDate,
                      );
                      const formattedEndDate = formatDateToReadable(
                        holiday.endDate || holiday.startDate,
                      );
                      const isSelected = selected.some(
                        (s) => s.id === holiday._id,
                      );

                      return (
                        <tr
                          key={holiday._id}
                          className={`hover:bg-gray-50 border-b ${isSelected ? "bg-blue-50" : ""}`}
                        >
                          <td className="p-2 md:p-3">
                            <div className="flex items-center justify-center gap-1 md:gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(holiday)}
                                className="cursor-pointer"
                              />
                              <span className="text-xs md:text-sm">
                                {(currentPage - 1) * holidaysPerPage +
                                  index +
                                  1}
                              </span>
                            </div>
                          </td>
                          <td className="p-2 md:p-3 text-left">
                            <div className="flex flex-col">
                              <span className="capitalize font-medium text-gray-800 text-sm md:text-base">
                                {holiday.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                {formattedStartDate}
                              </span>
                            </div>
                          </td>
                          <td className="p-2 md:p-3 hidden md:table-cell text-sm">
                            {formattedEndDate}
                          </td>
                          <td className="p-2 md:p-3 hidden lg:table-cell capitalize text-sm">
                            {holiday.description?.substring(0, 40) ||
                              "No description"}
                            {holiday.description?.length > 40 && "..."}
                          </td>
                          <td className="p-2 md:p-3">
                            <div className="flex items-center justify-center gap-2 md:gap-3">
                              <button
                                onClick={() => handleView(holiday)}
                                className="text-blue-600 hover:text-blue-800 cursor-pointer p-1"
                                title="View"
                              >
                                <Eye size={isMobileView ? 16 : 18} />
                              </button>
                              {!isMobileView && (
                                <button
                                  onClick={() => editHoliday(holiday)}
                                  className="text-green-600 hover:text-green-800 cursor-pointer p-1"
                                  title="Edit"
                                >
                                  <Edit size={18} />
                                </button>
                              )}
                              {!isMobileView && (
                                <button
                                  onClick={() => deleteHoliday(holiday)}
                                  className="text-red-600 hover:text-red-800 cursor-pointer p-1"
                                  title="Delete"
                                >
                                  <Trash2 size={18} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 p-3 md:p-5 flex justify-center md:justify-start gap-1 md:gap-2 flex-wrap">
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={currentPage === 1}
                    className="px-2 md:px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
                  >
                    Prev
                  </button>
                  {visiblePages.map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-2 md:px-3 py-1 rounded w-8 md:w-10 text-center transition cursor-pointer text-sm ${
                        currentPage === page
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-200 hover:bg-gray-300"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    disabled={currentPage === totalPages}
                    className="px-2 md:px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Import Modal */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50 p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={handleCloseImportModal}
            />
            <div className="bg-white w-full max-w-md p-4 md:p-6 rounded-xl shadow-lg relative">
              <button
                onClick={handleCloseImportModal}
                className="absolute top-2 md:top-3 right-2 md:right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                disabled={isUploading}
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Import Holidays
              </h2>
              {isSampleFile && <SampleExcelDownloadHolidays />}
              <div className="mb-6">
                <label className="block text-gray-700 mb-2 text-sm">
                  Upload Excel File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 cursor-pointer text-sm"
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
                  className={`px-4 md:px-5 py-2 rounded-lg cursor-pointer text-sm ${
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
                  className={`px-4 md:px-5 py-2 rounded-lg cursor-pointer text-sm ${
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
          document.body,
        )}

      {/* Add Holiday Modal */}
      {isAddModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50 p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsAddModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-4 md:p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="absolute top-2 md:top-3 right-2 md:right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Add New Holiday
              </h2>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium">
                    Holiday Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg capitalize text-sm md:text-base"
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
                    className="w-full border px-3 py-2 rounded-lg text-sm md:text-base"
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
                    className="w-full border px-3 py-2 rounded-lg text-sm md:text-base"
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
                    className="w-full border px-3 py-2 rounded-lg text-sm md:text-base"
                    rows="3"
                    placeholder="Optional description"
                  />
                </div>
              </form>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 md:px-5 py-2 rounded-lg cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddHoliday}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 md:px-5 py-2 rounded-lg cursor-pointer text-sm"
                >
                  Add Holiday
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Edit Holiday Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50 p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsEditModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-4 md:p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-2 md:top-3 right-2 md:right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Holiday
              </h2>
              <form className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium">
                    Holiday Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg capitalize text-sm md:text-base"
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
                    className="w-full border px-3 py-2 rounded-lg text-sm md:text-base"
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
                    className="w-full border px-3 py-2 rounded-lg text-sm md:text-base"
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
                    className="w-full border px-3 py-2 rounded-lg text-sm md:text-base"
                    rows="3"
                  />
                </div>
              </form>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 md:px-5 py-2 rounded-lg cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateHoliday}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 md:px-5 py-2 rounded-lg cursor-pointer text-sm"
                >
                  Update Holiday
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* View Holiday Modal */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50 p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsViewModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-4 md:p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-2 md:top-3 right-2 md:right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
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
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize text-sm md:text-base">
                    {form.name} ({formatDateToShort(form.startDate)})
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Start Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 text-sm md:text-base">
                    {formatDateToReadable(form.startDate)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    End Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 text-sm md:text-base">
                    {formatDateToReadable(form.endDate || form.startDate)}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Description
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 min-h-[80px] text-sm md:text-base">
                    {form.description?.trim()
                      ? form.description
                      : "No Description"}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 md:px-5 py-2 rounded-lg cursor-pointer text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  
  );
};

export default Holidays;