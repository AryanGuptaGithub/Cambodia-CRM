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
  const fileInputRef = useRef(null); // Add ref for file input
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

  const filteredHolidays = holidays.filter(
    (r) =>
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.startDate &&
        r.startDate.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Get upcoming holidays for CURRENT MONTH only (excluding Sundays)
  const currentMonthHolidays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    return holidays
      .filter((holiday) => {
        if (!holiday.startDate) return false;
        const holidayDate = new Date(holiday.startDate);
        holidayDate.setHours(0, 0, 0, 0);

        return (
          holidayDate >= today &&
          holidayDate <= endOfMonth &&
          holidayDate.getDay() !== 0
        );
      })
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [holidays, currentMonth, currentYear]);

  // Get holidays for calendar display (current displayed month)
  const currentCalendarMonthHolidays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    return holidays
      .filter((holiday) => {
        if (!holiday.startDate) return false;
        const holidayDate = new Date(holiday.startDate);
        holidayDate.setHours(0, 0, 0, 0);

        return (
          holidayDate >= startOfMonth &&
          holidayDate <= endOfMonth &&
          holidayDate.getDay() !== 0
        );
      })
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [holidays, currentMonth, currentYear]);

  // Get holidays for the entire year
  const currentYearHolidays = useMemo(() => {
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31);
    endOfYear.setHours(23, 59, 59, 999);

    return holidays
      .filter((holiday) => {
        if (!holiday.startDate) return false;
        const holidayDate = new Date(holiday.startDate);
        holidayDate.setHours(0, 0, 0, 0);

        return (
          holidayDate >= startOfYear &&
          holidayDate <= endOfYear &&
          holidayDate.getDay() !== 0
        );
      })
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [holidays, currentYear]);

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

        return (
          holidayDate >= startOfNextMonth &&
          holidayDate <= endOfNextMonth &&
          holidayDate.getDay() !== 0
        );
      })
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [holidays, currentMonth, currentYear]);

  // Pagination for current month holidays
  const currentMonthHolidaysTotalPages = Math.ceil(
    currentMonthHolidays.length / upcomingHolidaysPerPage
  );
  const currentMonthHolidaysToShow = currentMonthHolidays.slice(
    (upcomingHolidaysPage - 1) * upcomingHolidaysPerPage,
    upcomingHolidaysPage * upcomingHolidaysPerPage
  );

  // Pagination for calendar month holidays
  const currentCalendarMonthHolidaysTotalPages = Math.ceil(
    currentCalendarMonthHolidays.length / upcomingHolidaysPerPage
  );
  const currentCalendarMonthHolidaysToShow = currentCalendarMonthHolidays.slice(
    (upcomingHolidaysPage - 1) * upcomingHolidaysPerPage,
    upcomingHolidaysPage * upcomingHolidaysPerPage
  );

  // Pagination for year holidays
  const currentYearHolidaysTotalPages = Math.ceil(
    currentYearHolidays.length / upcomingHolidaysPerPage
  );
  const currentYearHolidaysToShow = currentYearHolidays.slice(
    (upcomingHolidaysPage - 1) * upcomingHolidaysPerPage,
    upcomingHolidaysPage * upcomingHolidaysPerPage
  );

  const nextUpcomingHolidaysPage = () => {
    if (calendarViewType === "monthly") {
      if (upcomingHolidaysPage < currentCalendarMonthHolidaysTotalPages) {
        setUpcomingHolidaysPage((prev) => prev + 1);
      }
    } else {
      if (upcomingHolidaysPage < currentYearHolidaysTotalPages) {
        setUpcomingHolidaysPage((prev) => prev + 1);
      }
    }
  };

  const prevUpcomingHolidaysPage = () => {
    if (upcomingHolidaysPage > 1) {
      setUpcomingHolidaysPage((prev) => prev - 1);
    }
  };

  // Reset pagination when month/year changes
  useEffect(() => {
    setUpcomingHolidaysPage(1);
  }, [currentMonth, currentYear, calendarViewType]);

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

  // Toggle select all with proper ID handling
  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentHolidays.map((holiday) => ({
        id: holiday._id,
        name: holiday.name,
      }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  // Delete selected holidays function
  const handleDeleteSelected = async () => {
    if (selected.length === 0) {
      showToast("warning", "Please select holidays to delete");
      return;
    }

    const confirm = await confirmDialog({
      title: "Delete Selected Holidays",
      text: `Are you sure you want to delete <b>${selected.length}</b> holiday${
        selected.length > 1 ? "s" : ""
      }?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected: selected.map((s) => s.name),
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/holidays`, {
          data: { ids: selected.map((s) => s.id) },
        });

        if (res.status === 200) {
          showToast(
            "success",
            `${selected.length} holiday${
              selected.length > 1 ? "s" : ""
            } deleted successfully`
          );
          fetchHolidays();
          setSelected([]);
        }
      } catch (error) {
        console.error("Delete selected error:", error);
        showToast("error", "Failed to delete selected holidays.");
      }
    }
  };

  // Open edit modal with selected holiday data
  const editHoliday = (holiday) => {
    setForm({
      ...holiday,
      startDate: holiday.startDate || "",
      endDate: holiday.endDate || holiday.startDate || "",
    });
    setIsEditModalOpen(true);
  };

  // Open view modal with selected holiday data
  const handleView = (holiday) => {
    setForm({
      ...holiday,
      startDate: holiday.startDate || "",
      endDate: holiday.endDate || holiday.startDate || "",
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

  // Calendar date click - only opens view modal for existing holidays
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
        endDate: existingHoliday.endDate || existingHoliday.startDate || "",
      });
      setIsViewModalOpen(true);
    }
  };

  // Add holiday function - reset form when opening modal
  const handleAddButtonClick = () => {
    setForm({
      startDate: "",
      endDate: "",
      name: "",
      description: "",
      _id: null,
    });
    setIsAddModalOpen(true);
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
      console.error("Add holiday error:", err);
      showToast(
        "error",
        err.response?.data?.message || "Failed to add holiday."
      );
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
      console.error("Update holiday error:", err);
      showToast(
        "error",
        err.response?.data?.message || "Failed to update holiday."
      );
    }
  };

  // DatePicker change handlers
  const handleStartDateChange = (date) => {
    if (date) {
      // Create date in local timezone but store as UTC
      const localDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );
      const isoDateString = localDate.toISOString();

      setForm((prev) => ({
        ...prev,
        startDate: isoDateString,
        // If end date is not set or is before start date, update end date
        endDate:
          !prev.endDate || new Date(prev.endDate) < date
            ? isoDateString
            : prev.endDate,
      }));
    } else {
      setForm((prev) => ({ ...prev, startDate: "" }));
    }
  };

  const handleEndDateChange = (date) => {
    if (date) {
      const localDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );
      const isoDateString = localDate.toISOString();
      setForm((prev) => ({ ...prev, endDate: isoDateString }));
    } else {
      setForm((prev) => ({ ...prev, endDate: "" }));
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

  // Parse date in "dd-mmm-yyyy" format (like "31-Oct-2025")
  const parseCustomDate = (dateString) => {
    if (!dateString) return null;

    // If it's already a Date object or number
    if (dateString instanceof Date) return dateString;
    if (typeof dateString === "number") return new Date(dateString);

    // Handle "dd-mmm-yyyy" format (e.g., "31-Oct-2025")
    const match = dateString
      .toString()
      .match(/^(\d{1,2})-([a-zA-Z]{3})-(\d{4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const monthStr = match[2].toLowerCase();
      const year = parseInt(match[3], 10);

      const monthMap = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,
      };

      const month = monthMap[monthStr];
      if (month !== undefined) {
        return new Date(year, month, day);
      }
    }

    // Try parsing as regular date string
    const parsed = new Date(dateString);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  // Handle closing import modal
  const handleCloseImportModal = () => {
    if (!isUploading) {
      setShowImportModal(false);
      setParsedData([]); // Reset parsed data when modal closes
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Reset file input
      }
    }
  };

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
        raw: false,
      });

      if (rows.length === 0) {
        showToast("warning", "Excel file is empty");
        return;
      }

      const possibleHeaders = {
        "holiday name": ["holiday name", "holiday", "name", "holidayname"],
        "start date": ["start date", "startdate", "start", "date"],
        "end date": ["end date", "enddate", "end", "to date"],
        description: ["description", "desc", "details", "note"],
      };

      let headerRowIndex = -1;
      let headerMapping = {};

      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map((cell) =>
          cell?.toString().trim().toLowerCase()
        );

        const foundHeaders = {};
        Object.entries(possibleHeaders).forEach(([mainHeader, variations]) => {
          const foundVariation = variations.find((variation) =>
            row.includes(variation)
          );
          if (foundVariation) {
            const columnIndex = row.indexOf(foundVariation);
            foundHeaders[mainHeader] = columnIndex;
          }
        });

        if (Object.keys(foundHeaders).length >= 2) {
          headerRowIndex = i;
          headerMapping = foundHeaders;
          break;
        }
      }

      if (headerRowIndex === -1) {
        showToast("error", "Could not find valid headers in the Excel file");
        return;
      }

      const dataRows = rows.slice(headerRowIndex + 1);
      if (dataRows.length === 0) {
        showToast("warning", "No data found in Excel file");
        return;
      }

      // Validate each row, and if any startDate is Sunday, show error and return early
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const item = {};

        Object.entries(headerMapping).forEach(([header, columnIndex]) => {
          if (
            typeof columnIndex === "number" &&
            columnIndex >= 0 &&
            columnIndex < row.length
          ) {
            item[header] = row[columnIndex] || "";
          } else {
            item[header] = "";
          }
        });

        const startDate = parseCustomDate(item["start date"]);
        if (!startDate) continue; // Skip invalid dates here

        if (startDate.getDay() === 0) {
          showToast(
            "error",
            `Holiday "<b>${
              item["holiday name"] || "Unnamed"
            }</b>" cannot be on Sunday (${item["start date"]})`
          );
          return;
        }
      }

      // If validation passed, map the data normally
      const mappedData = dataRows
        .map((row, rowIndex) => {
          const item = {};

          Object.entries(headerMapping).forEach(([header, columnIndex]) => {
            if (
              typeof columnIndex === "number" &&
              columnIndex >= 0 &&
              columnIndex < row.length
            ) {
              item[header] = row[columnIndex] || "";
            } else {
              item[header] = "";
            }
          });

          const startDate = parseCustomDate(item["start date"]);
          const endDate = parseCustomDate(item["end date"]) || startDate;

          if (!startDate) {
            return null;
          }

          return {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            name: item["holiday name"]?.toString().trim() || "",
            description: item["description"]?.toString().trim() || "",
          };
        })
        .filter((entry) => entry !== null);

      if (mappedData.length === 0) {
        showToast("warning", "No valid holiday data found in file");
        return;
      }
      setParsedData(mappedData);
    };

    reader.onerror = () => {
      showToast("error", "Error reading file");
    };

    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }
    setIsUploading(true);
    console.log("values of pares", parsedData);
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
      const errorMessage =
        err.response?.data?.message || "Failed to import holidays.";
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

  // Clear selections when holidays data changes significantly
  useEffect(() => {
    // Clear selections if all selected holidays are no longer in currentHolidays
    const shouldClearSelections = selected.some(
      (selectedHoliday) =>
        !currentHolidays.some((holiday) => holiday._id === selectedHoliday.id)
    );

    if (shouldClearSelections) {
      setSelected([]);
    }
  }, [currentHolidays, selected]);

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

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className="flex">
              <div className="flex gap-3">
                {currentCalendarMonthHolidays.length > 0 && (
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
                )}

                <div className="flex px-0.9">
                  {currentCalendarMonthHolidaysToShow.length > 0 ? (
                    <div className="flex gap-2">
                      {currentCalendarMonthHolidaysToShow.map((holiday) => (
                        <div
                          key={holiday._id}
                          className="inline-block bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100 transition-colors whitespace-nowrap"
                        >
                          <div className="font-medium text-blue-800 text-sm">
                            {holiday.name} (
                            {formatDateToReadable(holiday.startDate)})
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm py-2">
                      No holidays in {monthNames[currentMonth]} {currentYear}
                    </div>
                  )}
                </div>
                {currentCalendarMonthHolidays.length > 0 && (
                  <button
                    onClick={nextUpcomingHolidaysPage}
                    disabled={
                      upcomingHolidaysPage ===
                      currentCalendarMonthHolidaysTotalPages
                    }
                    className={`p-2 rounded-lg border ${
                      upcomingHolidaysPage ===
                      currentCalendarMonthHolidaysTotalPages
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer border-gray-300"
                    }`}
                  >
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Month Navigation with Holiday Count */}
          <div className="flex items-center gap-4">
            {/* Holiday Count Display */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-blue-800">
                {currentCalendarMonthHolidays.length} holiday
                {currentCalendarMonthHolidays.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Month Navigation Buttons */}
            <div className="flex items-center gap-3">
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
            const holidayName = getHolidayName(
              date.toISOString().split("T")[0]
            );

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

  // Render annual calendar with same layout as monthly
  const renderAnnualCalendar = () => {
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

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className="flex">
              <div className="flex gap-3">
                {currentYearHolidays.length > 0 && (
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
                )}

                <div className="flex px-0.9">
                  {currentYearHolidaysToShow.length > 0 ? (
                    <div className="flex gap-2">
                      {currentYearHolidaysToShow.map((holiday) => (
                        <div
                          key={holiday._id}
                          className="inline-block bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100 transition-colors whitespace-nowrap"
                        >
                          <div className="font-medium text-blue-800 text-sm">
                            {holiday.name} (
                            {formatDateToReadable(holiday.startDate)})
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm py-2">
                      No holidays in {currentYear}
                    </div>
                  )}
                </div>
                {currentYearHolidays.length > 0 && (
                  <button
                    onClick={nextUpcomingHolidaysPage}
                    disabled={
                      upcomingHolidaysPage === currentYearHolidaysTotalPages
                    }
                    className={`p-2 rounded-lg border ${
                      upcomingHolidaysPage === currentYearHolidaysTotalPages
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-white text-gray-700 hover:bg-gray-50 cursor-pointer border-gray-300"
                    }`}
                  >
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Year Navigation with Holiday Count */}
          <div className="flex items-center gap-4">
            {/* Holiday Count Display */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-blue-800">
                {currentYearHolidays.length} holiday
                {currentYearHolidays.length !== 1 ? "s" : ""} in {currentYear}
              </div>
            </div>

            {/* Year Navigation Buttons */}
            <div className="flex items-center gap-3">
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
        </div>

        {/* Annual Calendar Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {monthNames.map((monthName, monthIndex) => {
            const monthDays = getDaysInMonth(currentYear, monthIndex);
            const isCurrentMonth = monthIndex === new Date().getMonth();

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
                    const isToday =
                      date.toDateString() === new Date().toDateString();

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
