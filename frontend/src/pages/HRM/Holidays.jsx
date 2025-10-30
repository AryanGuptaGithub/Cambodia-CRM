import React, { useState, useEffect, useMemo, useRef } from "react";
import { Eye, Edit, Trash2, UserPlus, Upload, X, Search, Calendar } from "lucide-react";
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
  const [nextHolidayCode, setNextHolidayCode] = useState(null);
  const inputRef = useRef(null);

  const [form, setForm] = useState({
    holidayCode: "",
    date: "",
    name: "",
    type: "",
    description: "",
    _id: null,
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Calendar view states
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`${backendUrl}/api/holidays`);
        if (!response.ok) throw new Error("Failed to fetch holidays");
        const data = await response.json();
        setHolidays(data.holidays);
        if (data.nextHolidayCode) {
          setNextHolidayCode(data.nextHolidayCode);
        }
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);
  
  const filteredHolidays = holidays.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.date.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination calculations
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
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Selected holidays deleted successfully");
          const updated = await fetch(`${backendUrl}/api/holidays`);
          const data = await updated.json();
          setHolidays(data.holidays);
          setNextHolidayCode(data.nextHolidayCode);
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
    setForm({ ...holiday });
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  // Open view modal with selected holiday data
  const handleView = (holiday) => {
    setForm({ ...holiday });
    setIsOpen(true);
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
          const updated = await axios.get(`${backendUrl}/api/holidays`);
          const holidays = updated.data.holidays;
          setHolidays(holidays);
          setNextHolidayCode(updated.data.nextHolidayCode);
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete holiday.");
      }
    }
  };

  // File upload and parsing logic for import
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

      // Expected headers for holidays
      const requiredHeaders = [
        "holiday code",
        "date",
        "name",
        "type",
        "description",
      ];

      let headerRowIndex = -1;
      let matchedHeaders = [];

      // Find header row (first 10 rows max)
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map((cell) =>
          cell?.toString().trim().toLowerCase()
        );
        const matched = requiredHeaders.filter((header) =>
          row.includes(header)
        );
        if (matched.length >= 3) {
          headerRowIndex = i;
          matchedHeaders = matched;
          break;
        }
      }

      // If required headers not found
      if (
        headerRowIndex === -1 ||
        matchedHeaders.length < requiredHeaders.length
      ) {
        const missingHeaders = requiredHeaders.filter(
          (header) => !matchedHeaders.includes(header)
        );
        const errorMsg = `❌ Required headers not found in Excel file:\n\n${missingHeaders.join(
          ", "
        )}`;
        showToast("error", errorMsg);
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
      if (dataRows.length == 0) {
        showToast("warning", "Excel file is empty");
        return;
      }

      const mappedData = dataRows
        .map((row, rowIndex) => {
          const item = {};
          Object.entries(headersMap).forEach(([index, key]) => {
            item[key] = row[index] || "";
          });

          return {
            holidayCode: item["holiday code"],
            date: parseExcelDate(item["date"]),
            name: item["name"],
            type: item["type"],
            description: item["description"],
          };
        })
        .filter((entry, index) => {
          const keep = !!entry.holidayCode && !!entry.name;
          return keep;
        });
      setParsedData(mappedData);
    };

    reader.readAsArrayBuffer(file);
  };

  const parseExcelDate = (value) => {
    if (!value) return null;

    if (typeof value === "number") {
      const jsDate = new Date(Math.round((value - 25569) * 86400 * 1000));
      return jsDate.toISOString();
    }

    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
        const response = await fetch(`${backendUrl}/api/holidays`);
        const data = await response.json();
        setHolidays(data.holidays);
        setNextHolidayCode(data.nextHolidayCode);
      }
    } catch (err) {
      console.error("Import error:", err);
      if (err.response) {
        const { message } = err.response.data;
        const cleanMessage = message.replace(/<[^>]+>/g, "");

        showToast("error", cleanMessage || "Failed to import holidays.");
      } else {
        showToast("error", "Network error. Please try again.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Update holiday on backend
  const handleUpdateHoliday = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.put(
        `${backendUrl}/api/holidays/${form._id}`,
        form
      );
      if (res.status === 200) {
        showToast(
          "success",
          `Holiday <b>${form.name}</b> updated successfully`
        );
        setIsEditModalOpen(false);
        const updated = await fetch(`${backendUrl}/api/holidays`);
        const data = await updated.json();
        setHolidays(data.holidays);
        setNextHolidayCode(data.nextHolidayCode);
      }
    } catch (err) {
      showToast("error", "Failed to update holiday.");
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
    }
  };
  
  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  // Calendar view functions
  const addHoliday = () => {
    if (selectedDate) {
      const date = new Date(selectedDate);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      
      // Check if not already added
      const dateString = date.toISOString().split('T')[0];
      if (!holidays.some(h => h.date.split('T')[0] === dateString)) {
        const newHoliday = {
          holidayCode: `HOL${Date.now()}`,
          date: dateString,
          name: `Holiday on ${dateString}`,
          type: "Custom",
          description: "Added from calendar",
          enabled: true
        };
        
        // Here you would typically make an API call to save the holiday
        setHolidays(prev => [...prev, newHoliday]);
        showToast("success", "Holiday added successfully");
      } else {
        showToast("warning", "Holiday already exists for this date");
      }
      setSelectedDate('');
    }
  };

  const removeHolidayByDate = (dateToRemove) => {
    setHolidays(holidays.filter(holiday => {
      const holidayDate = new Date(holiday.date).toISOString().split('T')[0];
      return holidayDate !== dateToRemove;
    }));
  };

  const isSunday = (date) => {
    return date.getDay() === 0;
  };

  const isHoliday = (date) => {
    const dateString = date.toISOString().split('T')[0];
    return holidays.some(holiday => {
      const holidayDate = new Date(holiday.date).toISOString().split('T')[0];
      return holidayDate === dateString;
    });
  };

  const getDaysInMonth = () => {
    const days = [];
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(currentYear, currentMonth, i));
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

  const getHolidayName = (dateString) => {
    const holiday = holidays.find(h => {
      const holidayDate = new Date(h.date).toISOString().split('T')[0];
      return holidayDate === dateString;
    });
    return holiday ? holiday.name : `Holiday on ${dateString}`;
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  const days = getDaysInMonth();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={() =>
              navigate("/masterlayout/holidays/new", {
                state: { holidayCode: nextHolidayCode },
              })
            }
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <UserPlus size={18} /> Add New Holiday
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
            <Calendar size={18} /> {showCalendarView ? 'Show Table' : 'Show Calendar'}
          </button>

          {selected.length > 0 && (
            <button
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => handleDeleteSelected()}
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>
        <div className="flex justify-between items-center mb-4 gap-8">
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
      </div>

      {showCalendarView ? (
        /* Calendar View */
        <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
          {/* Calendar Header with Add Holiday */}
          <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <div className="flex gap-3 items-center flex-wrap">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={addHoliday}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg cursor-pointer"
              >
                <UserPlus size={16} /> Add Holiday
              </button>
            </div>
            
            <div className="flex gap-3 items-center">
              <button
                onClick={prevMonth}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
              >
                &larr;
              </button>
              <h2 className="text-xl font-bold text-gray-800 min-w-[200px] text-center">
                {monthNames[currentMonth]} {currentYear}
              </h2>
              <button
                onClick={nextMonth}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
              >
                &rarr;
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2 mb-6">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="text-center font-semibold py-2 text-gray-700"
              >
                {day}
              </div>
            ))}

            {days.map((date, index) => {
              if (date === null) {
                return <div key={`empty-${index}`} className="h-12" />;
              }

              const isHolidayDay = isHoliday(date);
              const isCurrentMonth = date.getMonth() === currentMonth;
              const isToday = date.toDateString() === new Date().toDateString();

              return (
                <div
                  key={date.toISOString()}
                  className={`h-12 flex items-center justify-center rounded-lg border-2 cursor-pointer transition-all ${
                    isHolidayDay
                      ? 'bg-red-500 text-white border-red-600'
                      : isToday
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                  } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                  onClick={() => {
                    if (isHolidayDay) {
                      const dateString = date.toISOString().split('T')[0];
                      removeHolidayByDate(dateString);
                    } else {
                      const dateString = date.toISOString().split('T')[0];
                      setSelectedDate(dateString);
                    }
                  }}
                >
                  {date.getDate()}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded border-2 border-red-600"></div>
              <span>Holiday</span>
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
                        checked={selected.length === currentHolidays.length && currentHolidays.length > 0} 
                        onChange={(e) => toggleSelectAll(e.target.checked)} 
                      />
                    )}
                    <span>Holiday Name</span>
                  </div>
                </th>
                <th className="p-3 text-sm font-medium">Date</th>
                <th className="p-3 text-sm font-medium">Type</th>
                <th className="p-3 text-sm font-medium">Description</th>
                <th className="p-3 text-sm font-medium">Status</th>
                <th className="p-3 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentHolidays.length > 0 ? (
                currentHolidays.map((holiday, index) => (
                  <tr key={holiday._id} className={`hover:bg-gray-50 ${(index + 1) % holidaysPerPage === 0 || index + 1 === currentHolidays.length ? "" : "border-b"}`}>
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
                    <td className="p-3">{formatDateToReadable(holiday.date)}</td>
                    <td className="p-3 capitalize">{holiday.type}</td>
                    <td className="p-3 capitalize">{holiday.description || "No description"}</td>
                    <td>
                      <button 
                        onClick={() => handlerEnabledHoliday(holiday._id)} 
                        className={`px-3 py-1 rounded-full text-sm cursor-pointer ${
                          holiday.enabled ? "bg-green-100 text-green-600" : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {holiday.enabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button className="text-blue-600 hover:text-blue-800 cursor-pointer">
                        <Eye onClick={() => handleView(holiday)} size={18} />
                      </button>
                      <button className="text-green-600 hover:text-green-800 cursor-pointer">
                        <Edit onClick={() => editHoliday(holiday)} size={18} />
                      </button>
                      <button onClick={() => deleteHoliday(holiday)} className="text-red-600 hover:text-red-800 cursor-pointer">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-3 text-center">No holiday records found</td>
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
                  <span key={`ellipsis-${idx}`} className="px-3 py-1 text-gray-500 select-none cursor-pointer">...</span>
                ) : (
                  <button 
                    key={page} 
                    onClick={() => setCurrentPage(page)} 
                    className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${
                      currentPage === page ? "bg-indigo-600 text-white" : "bg-gray-200 hover:bg-gray-300"
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
      {showImportModal && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowImportModal(false)} />
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
            <button 
              onClick={() => setShowImportModal(false)} 
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer" 
              disabled={isUploading}
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Import Holidays</h2>
            {isSampleFile && <SampleExcelDownloadHolidays />}
            <div className="mb-6">
              <label className="block text-gray-700 mb-2">File</label>
              <input 
                type="file" 
                accept=".csv, .xlsx" 
                onChange={handleFileUpload} 
                className="block w-full border rounded-lg px-3 py-2 cursor-pointer" 
              />
            </div>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowImportModal(false)} 
                disabled={isUploading} 
                className={`px-5 py-2 rounded-lg cursor-pointer ${
                  isUploading ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-gray-300 hover:bg-gray-400 text-gray-700"
                }`}
              >
                Cancel
              </button>
              <button 
                onClick={handleImport} 
                disabled={isUploading} 
                className={`px-5 py-2 rounded-lg cursor-pointer ${
                  isUploading ? "bg-blue-400 text-white cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {isUploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Holiday Modal */}
      {isEditModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)} />
          <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
            <button onClick={() => setIsEditModalOpen(false)} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer">
              <X size={20} />
            </button>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Edit Holiday</h2>
            <form onSubmit={handleUpdateHoliday} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Holiday Code</label>
                <input 
                  type="text" 
                  value={form.holidayCode} 
                  onChange={(e) => setForm({ ...form, holidayCode: e.target.value })} 
                  className="w-full border px-3 py-2 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed" 
                  disabled 
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Holiday Name</label>
                <input 
                  type="text" 
                  value={form.name} 
                  onChange={(e) => setForm({ ...form, name: e.target.value })} 
                  className="w-full border px-3 py-2 rounded-lg capitalize" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Type</label>
                <select 
                  value={form.type} 
                  onChange={(e) => setForm({ ...form, type: e.target.value })} 
                  className="w-full border px-3 py-2 rounded-lg capitalize"
                >
                  <option value="national">National</option>
                  <option value="regional">Regional</option>
                  <option value="religious">Religious</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">Date</label>
                <DatePicker 
                  selected={form.date ? new Date(form.date) : null} 
                  onChange={(date) => date ? setForm({ ...form, date: date.toISOString() }) : null} 
                  dateFormat="yyyy-MM-dd" 
                  placeholderText="Select a date" 
                  className="w-full border px-3 py-2 rounded-lg" 
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium">Description</label>
                <textarea 
                  value={form.description} 
                  onChange={(e) => setForm({ ...form, description: e.target.value })} 
                  className="w-full border px-3 py-2 rounded-lg" 
                  rows="3"
                />
              </div>
            </form>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setIsEditModalOpen(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer">
                Cancel
              </button>
              <button onClick={handleUpdateHoliday} className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer">
                Update
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* View Holiday Modal */}
      {isViewModalOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsViewModalOpen(false)} />
          <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
            <button onClick={() => setIsViewModalOpen(false)} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer">
              <X size={20} />
            </button>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">View Holiday</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600">Holiday Code</label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">{form.holidayCode}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600">Holiday Name</label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">{form.name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600">Type</label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">{form.type}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600">Date</label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100">{formatDateToReadable(form.date)}</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-600">Description</label>
                <p className="border px-3 py-2 rounded-lg bg-gray-100 min-h-[80px]">{form.description?.trim() ? form.description : "No Description"}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setIsViewModalOpen(false)} className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer">
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