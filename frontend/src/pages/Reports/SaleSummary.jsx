import React, { useState, useRef, useEffect, useCallback } from "react";
import { Search, UserPlus, Upload, X, Eye, Edit, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SampleExcelDownloadDailySummaryReport from "../../excels/SampleExcelDownloadDailySummary";
import ReactDOM from "react-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import PiChartDatePicker from "../../utils/PiChartDatePicker";

const saleSummaryPerPage = 9;

const SaleSummary = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [dailySummaries, setDailySummaries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isViewCombineModalOpen, setIsViewCombineModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);
  const pickerRef = useRef(null);
  const [isSelectingStart, setIsSelectingStart] = useState(true);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [selectedTab, setSelectedTab] = useState("Single");
  const [dailySummariesDateWise, setDailySummariesDateWise] = useState([]);

  // API call effect
  useEffect(() => {
    if (startDate && endDate) {
      const fetchData = async () => {
        try {
          const response = await fetch(
            `${backendUrl}/api/dailysummary/byDate?start=${startDate.toISOString()}&end=${endDate.toISOString()}`
          );
          const data = await response.json();
          setDailySummaries(data);
        } catch (error) {
          console.error("API call failed:", error);
        }
      };

      fetchData();
    }
  }, [startDate, endDate]);
  const positionFlatpickrCalendar = () => {
    setTimeout(() => {
      const calendar = document.querySelector(".flatpickr-calendar");
      const icon = document.getElementById("calendarTrigger");

      if (!calendar || !icon) return;

      const iconRect = icon.getBoundingClientRect();
      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft =
        window.pageXOffset || document.documentElement.scrollLeft;
      const calendarWidth = calendar.offsetWidth;
      const windowWidth = window.innerWidth;

      let left = iconRect.left + scrollLeft - calendarWidth;
      if (left < 10) left = 10;
      if (left + calendarWidth > windowWidth) {
        left = windowWidth - calendarWidth - 10;
      }

      const top = iconRect.bottom + scrollTop + 12;

      calendar.style.position = "absolute";
      calendar.style.top = `${top}px`;
      calendar.style.left = `${left}px`;
      calendar.style.right = "auto";

      if (!calendar.querySelector(".custom-footer")) {
        const footer = document.createElement("div");
        footer.className =
          "custom-footer flex justify-between p-2 border-t border-gray-300 bg-gray-100";

        const btnClasses =
          "px-3 py-1 text-xs rounded border border-gray-300 hover:bg-gray-200 cursor-pointer";

        const todayBtn = document.createElement("button");
        todayBtn.textContent = "Today";
        todayBtn.className = btnClasses;

        const resetBtn = document.createElement("button");
        resetBtn.textContent = "Reset";
        resetBtn.className = btnClasses;

        todayBtn.onclick = () => {
          const today = new Date();
          pickerRef.current.flatpickr.setDate(today, true);
          setStartDate(today);
          setEndDate(today);
          setIsSelectingStart(false);
          pickerRef.current.flatpickr.close();
        };

        resetBtn.onclick = () => {
          pickerRef.current.flatpickr.clear();
          setStartDate(null);
          setEndDate(null);
          setIsSelectingStart(true);
          pickerRef.current.flatpickr.close();
        };

        footer.appendChild(todayBtn);
        footer.appendChild(resetBtn);
        calendar.appendChild(footer);
      }
    }, 0);
  };

  const navigate = useNavigate();

  const [form, setForm] = useState({
    productName: "",
    salesQuantity: 0,
    bonusQuantity: 0,
    totalQuantity: 0,
    value: 0,
    date: "",
    dailySummaryReportsId: "",
    totalDayQuantity: 0,
    _id: "",
  });

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

  const search = searchTerm.toLowerCase();
  const isSingleTab = selectedTab.toLowerCase() === "single";

  useEffect(() => {
    const fetchData = async () => {
      try {
        let url = `${backendUrl}/api/dailysummary/byDate`;

        if (startDate && endDate) {
          url += `?start=${startDate.toISOString()}&end=${endDate.toISOString()}`;
        }

        const response = await fetch(url);
        const data = await response.json();
        setDailySummariesDateWise(data);
      } catch (error) {
        console.error("API call failed:", error);
      }
    };

    if (!isSingleTab) {
      fetchData();
    }
  }, [startDate, endDate, isSingleTab]);

  // Step 1: Flatten filtered products with parent metadata
  let allFilteredProducts = [];

  if (isSingleTab) {
    allFilteredProducts = dailySummaries.flatMap((item) => {
      const entryDate = new Date(item.date).toLocaleDateString("en-GB");

      const filteredProducts = item.products.filter((product) => {
        return (
          product.productName?.toLowerCase().includes(searchTerm) ||
          product.salesQuantity?.toString().includes(searchTerm) ||
          product.totalQuantity?.toString().includes(searchTerm) ||
          product.value?.toString().includes(searchTerm) ||
          product.bonusQuantity?.toString().includes(searchTerm) ||
          item.totalDayQuantity?.toString().includes(searchTerm) ||
          entryDate.includes(searchTerm)
        );
      });

      return filteredProducts.map((product) => ({
        ...product,
        date: item.date,
        totalDayQuantity: item.totalDayQuantity,
        dailySummaryReportsId: item._id,
      }));
    });
  } else {
    allFilteredProducts = dailySummariesDateWise.filter((item) => {
      return (
        item.productName?.toLowerCase().includes(searchTerm) ||
        item.salesQuantity?.toString().includes(searchTerm) ||
        item.bonusQuantity?.toString().includes(searchTerm) ||
        item.amount?.toString().includes(searchTerm) ||
        item.totalQuantity?.toString().includes(searchTerm) ||
        item.totalDayQuantity?.toString().includes(searchTerm)
      );
    });
  }

  // ✅ Pagination
  const totalPages = Math.ceil(allFilteredProducts.length / saleSummaryPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentDailySummaries = allFilteredProducts.slice(
    (currentPage - 1) * saleSummaryPerPage,
    currentPage * saleSummaryPerPage
  );

  const fetchDailySummary = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${backendUrl}/api/dailysummary`);
      if (!response.ok) throw new Error("Failed to fetch daily summaries.");

      const data = await response.json();
      setDailySummaries(data);
      setSelected([]);
    } catch (err) {
      console.error("Fetch error:", err);
      alert("Error fetching daily summaries");
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ useEffect to load on component mount
  useEffect(() => {
    fetchDailySummary();
  }, []);

  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> sale summary report(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (!confirm.isConfirmed) {
      setSelected([]);
      return;
    }

    try {
      const res = await axios.delete(`${backendUrl}/api/dailysummary`, {
        data: { ids: selected },
      });

      if (res.status === 200) {
        showToast("success", res.data.message);
        await fetchDailySummary();
      } else {
        showToast("error", "Failed to delete selected summary reports.");
      }
    } catch (error) {
      console.error("Delete error:", error);
      showToast("error", "Failed to delete selected summary reports.");
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
      });

      if (rows.length === 0) {
        showToast("warning", "Excel file is empty");
        return;
      }

      // ✅ Find header row that contains 'product name'
      const headerRowIndex = rows.findIndex((row) =>
        row.some(
          (cell) => typeof cell === "string" && /product\s*name/i.test(cell)
        )
      );

      if (headerRowIndex === -1) {
        showToast("error", "Header row not found (missing 'Product Name')");
        return;
      }

      const headerRow = rows[headerRowIndex];
      const dataRows = rows.slice(headerRowIndex + 1);

      // ✅ Map column indexes
      const headersMap = {};
      const dateColumnIndexes = [];

      headerRow.forEach((header, index) => {
        const headerText = header?.toString().trim().toLowerCase();

        if (!headerText) return;

        if (
          headerText === "product name" ||
          headerText === "sale quantity" ||
          headerText === "bonus quantity" ||
          headerText === "total quantity"
        ) {
          headersMap[headerText] = index;
        } else {
          // Try to parse as a date column (e.g., "30 Sep 2024", "31-Oct-2024", etc.)
          const parsedDate = parseDateFromHeader(headerText);
          if (parsedDate) {
            dateColumnIndexes.push({
              index,
              raw: header,
              isoDate: parsedDate.toISOString(),
            });
          }
        }
      });

      if (!headersMap["product name"]) {
        showToast("error", "Missing required column: 'Product Name'");
        return;
      }

      if (dateColumnIndexes.length === 0) {
        showToast("error", "No date columns found in the Excel header");
        return;
      }

      // ✅ Now process each date column individually
      const parsedPayloads = [];

      dateColumnIndexes.forEach(({ index: dateColIndex, isoDate }) => {
        const products = [];
        let totalDayQuantity = 0;

        dataRows.forEach((row) => {
          const productName = row[headersMap["product name"]]
            ?.toString()
            .trim();
          if (!productName) return;

          const salesQuantity = Number(row[headersMap["sale quantity"]]) || 0;
          const bonusQuantity = Number(row[headersMap["bonus quantity"]]) || 0;
          const totalQuantity = Number(row[headersMap["total quantity"]]) || 0;
          const value = Number(row[dateColIndex]) || 0;

          // Include only if at least one field is > 0
          if (
            salesQuantity > 0 ||
            bonusQuantity > 0 ||
            totalQuantity > 0 ||
            value > 0
          ) {
            products.push({
              productName,
              salesQuantity,
              bonusQuantity,
              totalQuantity,
              value,
            });
            totalDayQuantity += value;
          }
        });

        if (products.length > 0) {
          parsedPayloads.push({
            date: isoDate,
            products,
            totalDayQuantity,
          });
        }
      });

      if (parsedPayloads.length === 0) {
        showToast("info", "No valid data found for any date column");
        return;
      }

      setParsedData(parsedPayloads);
    };

    reader.readAsArrayBuffer(file);
  };

  // ✅ Helper to parse header cell like "30 Sep 2024", "31-Oct-2024", etc.
  const parseDateFromHeader = (text) => {
    if (!text) return null;

    const normalized = text.toString().trim().replace(/[-]/g, " ");
    const parsed = new Date(normalized);

    if (!isNaN(parsed.getTime())) {
      return new Date(parsed.setHours(0, 0, 0, 0));
    }

    return null;
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }
    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/dailysummary/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "daily summary reports imported successfully!"
        );
        setShowImportModal(false);
        fetchDailySummary();
      }
    } catch (err) {
      console.error("Import error:", err);
      if (err.response) {
        const { message } = err.response.data;
        const cleanMessage = message.replace(/<[^>]+>/g, "");

        showToast("error", cleanMessage || "Failed to import customers.");
      } else {
        showToast("error", "Network error. Please try again.");
      }
    } finally {
      setIsUploading(false);
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

  function capitalizeFirstLetter(str) {
    if (!str) return "";
    str = str.toString(); // ensure it's a string
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  const editSaleSammaryReports = (product, date) => {
    setForm({
      productName: product.productName || "",
      salesQuantity: product.salesQuantity || 0,
      bonusQuantity: product.bonusQuantity || 0,
      totalQuantity: product.totalQuantity || 0,
      value: product.value || 0,
      date: date || "",
      dailySummaryReportsId: product.dailySummaryReportsId || "", // summary _id
      totalDayQuantity: product.totalDayQuantity || 0,
      _id: product._id || "",
    });

    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  const editCombineSaleSammaryReports = (product) => {
    setForm({
      productName: product.productName || "",
      salesQuantity: product.salesQuantity || 0,
      bonusQuantity: product.bonusQuantity || 0,
      totalQuantity: product.totalQuantity || 0,
      value: product.value || 0,
      dailySummaryReportsId: product.dailySummaryReportsId || "", // summary _id
      totalDayQuantity: product.totalDayQuantity || 0,
      _id: product._id || "",
    });

    setIsOpen(true);
    setIsViewCombineModalOpen(true);
  };
  // Open view modal with selected customer data
  const handleSaleSammaryReports = (product, date) => {
    setForm({ ...product });
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  const deleteSaleSammaryReports = async (product, date) => {
    if (!product._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete sale Summary Reports <b>${product.productName}-${date}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/dailysummary/${product.dailySummaryReportsId}/${product._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            `Sale Summary <b>${product.productName}-${date}</b> deleted successfully`
          );
          fetchDailySummary();
        }
      } catch (error) {
        showToast("error", "Failed to delete customer.");
      }
    }
  };

  const handleUpdateDailySummaryReports = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.put(
        `${backendUrl}/api/dailysummary/${form.dailySummaryReportsId}/${form._id} `,
        form
      );
      if (res.status === 200) {
        showToast(
          "success",
          `Report for <b>${form.productName}</b> updated successfully`
        );
        setIsEditModalOpen(false);
        fetchDailySummary();
      }
    } catch (err) {
      showToast("error", "Failed to update daily summary report.");
      console.error("Update error:", err);
    }
  };

  // For individual selection
  const toggleSelect = (product) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c.id === product._id);

      if (exists) {
        // Remove if already selected
        return prev.filter((c) => c.id !== product._id);
      } else {
        // Add new selection
        return [
          ...prev,
          { id: product._id, saleSummaryId: product.dailySummaryReportsId },
        ];
      }
    });
  };

  // For select/deselect all
  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? currentDailySummaries.map((product) => ({
              id: product._id,
              saleSummaryId: product.dailySummaryReportsId,
            }))
          : []
      );
    },
    [currentDailySummaries]
  );

  function capitalizeFirstLetter(str) {
    if (!str) return "";
    str = str.toString(); // ensure it's a string
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-1">
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/reportlayout/salesummary/new")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <UserPlus size={18} /> Add New Summary Reports
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Upload size={18} /> Import CSV
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
        {selectedTab.toLowerCase() === "combine" && (
          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {allFilteredProducts.length}
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
                placeholder="Search..."
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

      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <div className="flex gap-4">
          {["Single", "Combine"].map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              className={`px-4 py-2 rounded-lg cursor-pointer ${
                selectedTab === tab
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              {capitalizeFirstLetter(tab)}
            </button>
          ))}
        </div>

        {selectedTab.toLowerCase() === "single" && (
          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {allFilteredProducts.length}
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
                placeholder="Search..."
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

        {selectedTab.toLowerCase() === "combine" && (
          <div className="w-full md:w-auto">
            <PiChartDatePicker
              setDailySummariesDateWise={setDailySummariesDateWise}
            />
          </div>
        )}
      </div>

      {selectedTab.toLowerCase() == "single" && (
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-xl overflow-hidden text-center">
            <thead className="bg-gray-100 text-gray-700 text-sm border-b">
              <tr>
                <th className="p-3">
                  <div className="flex items-center gap-4">
                    {currentDailySummaries.length > 0 && (
                      <input
                        type="checkbox"
                        checked={
                          selected.length === currentDailySummaries.length &&
                          currentDailySummaries.length > 0
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    )}
                    <span>Product Name</span>
                  </div>
                </th>
                <th className="p-3">Sales Quantity</th>
                <th className="p-3">Bonus Quantity</th>
                <th className="p-3">Total Quantity</th>
                <th className="p-3">Date</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Total Day Quantity</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {currentDailySummaries.length > 0 ? (
                currentDailySummaries.map((product, index) => {
                  const entryDate = formatDateToReadable(product.date);
                  const isSelected = selected.some(
                    (s) => s._id === product._id
                  );

                  return (
                    <tr
                      key={`${product.productName}-${index}`}
                      className={`hover:bg-gray-50 ${
                        (index + 1) % saleSummaryPerPage === 0 ||
                        index + 1 === currentDailySummaries.length
                          ? ""
                          : "border-b"
                      }`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-4">
                          <input
                            type="checkbox"
                            checked={selected.some((s) => s.id === product._id)}
                            onChange={() => toggleSelect(product)}
                          />
                          <span>
                            {capitalizeFirstLetter(product.productName)}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">{product.salesQuantity}</td>
                      <td className="p-3">{product.bonusQuantity}</td>
                      <td className="p-3">{product.totalQuantity}</td>
                      <td className="p-3">{entryDate}</td>
                      <td className="p-3 font-medium">
                        {product.value?.toFixed(2)}
                      </td>
                      <td className="p-3">{product.totalDayQuantity}</td>
                      <td className="p-3 flex items-center justify-center gap-3">
                        <button className="text-blue-600 hover:text-blue-800 cursor-pointer">
                          <Eye
                            onClick={() =>
                              handleSaleSammaryReports(product, entryDate)
                            }
                            size={18}
                          />
                        </button>
                        <button className="text-green-600 hover:text-green-800 cursor-pointer">
                          <Edit
                            onClick={() =>
                              editSaleSammaryReports(product, entryDate)
                            }
                            size={18}
                          />
                        </button>
                        <button
                          onClick={() =>
                            deleteSaleSammaryReports(product, entryDate)
                          }
                          className="text-red-600 hover:text-red-800 cursor-pointer"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-gray-500">
                    No sales found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {selectedTab.toLowerCase() == "combine" && (
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-xl overflow-hidden text-center">
            <thead className="bg-gray-100 text-gray-700 text-sm border-b">
              <tr>
                <th className="p-3">Product Name</th>
                <th className="p-3">Sales Quantity</th>
                <th className="p-3">Bonus Quantity</th>
                <th className="p-3">Total Quantity</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Views</th>
              </tr>
            </thead>
            <tbody>
              {currentDailySummaries.length > 0 ? (
                currentDailySummaries.map((product, index) => {
                  return (
                    <tr
                      key={`${product.productName}-${index}`}
                      className={`hover:bg-gray-50 ${
                        (index + 1) % saleSummaryPerPage === 0 ||
                        index + 1 === currentDailySummaries.length
                          ? ""
                          : "border-b"
                      }`}
                    >
                      <td className="p-3">
                        {capitalizeFirstLetter(product.productName)}
                      </td>
                      <td className="p-3">{product.salesQuantity}</td>
                      <td className="p-3">{product.bonusQuantity}</td>
                      <td className="p-3">{product.totalQuantity}</td>
                      <td className="p-3 font-medium">
                        {product.amount?.toFixed(2)}
                      </td>
                      <td className="p-3 flex items-center justify-center gap-3">
                        <button className="text-blue-600 hover:text-blue-800 cursor-pointer">
                          <Eye
                            onClick={() =>
                              editCombineSaleSammaryReports(product)
                            }
                            size={18}
                          />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-gray-500">
                    No sales found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {currentDailySummaries.length > 0 && (
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
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            {/* Background Overlay */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              {/* Close */}
              <button
                onClick={() => setShowImportModal(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                disabled={isUploading}
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Import Customer
              </h2>
              {isSampleFile && <SampleExcelDownloadDailySummaryReport />}
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
                    isUploading
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-gray-300 hover:bg-gray-400 text-gray-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={isUploading}
                  className={`px-5 py-2 rounded-lg cursor-pointer ${
                    isUploading
                      ? "bg-blue-400 text-white cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {isUploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
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
                Edit Sale Summary
              </h2>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const res = await axios.put(
                      `${backendUrl}/api/sales-summary/${form._id}`,
                      form
                    );
                    if (res.status === 200) {
                      showToast(
                        "success",
                        "Sales summary updated successfully"
                      );
                      setIsEditModalOpen(false);
                      await fetchAndSetData(); // Your function to refresh data
                    }
                  } catch (err) {
                    console.error("Update error:", err);
                    showToast("error", "Failed to update sales summary.");
                  }
                }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-sm font-medium">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={form.productName}
                    onChange={(e) =>
                      setForm({ ...form, productName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Sales Quantity
                  </label>
                  <input
                    type="number"
                    value={form.salesQuantity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        salesQuantity: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                    min={0}
                    step="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Bonus Quantity
                  </label>
                  <input
                    type="text"
                    value={form.bonusQuantity}
                    onChange={(e) => {
                      const value = e.target.value;

                      // Allow only numeric strings (optional: allow empty string)
                      if (/^\d*$/.test(value)) {
                        setForm({ ...form, bonusQuantity: value });
                      }
                    }}
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Total Quantity
                  </label>
                  <input
                    type="number"
                    value={form.totalQuantity}
                    onChange={(e) =>
                      setForm({ ...form, totalQuantity: +e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                    min={0}
                    step="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Amount</label>
                  <input
                    type="number"
                    value={form.value}
                    onChange={(e) =>
                      setForm({ ...form, value: +e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                    min={0}
                    step="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Date</label>
                  <DatePicker
                    selected={form.date ? new Date(form.date) : null}
                    onChange={(date) =>
                      date
                        ? setForm({ ...form, date: date.toISOString() })
                        : null
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                  />
                </div>
                {/* 
                <div>
                  <label className="block text-sm font-medium">
                    Total Day Quantity
                  </label>
                  <input
                    type="number"
                    value={form.totalDayQuantity}
                    className="w-full border px-3 py-2 rounded-lg"
                    disabled
                  />
                </div> */}
              </form>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="edit-sales-summary"
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                  onClick={handleUpdateDailySummaryReports}
                >
                  Update
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            {/* Background Overlay */}
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
                View Sales Summary
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Product Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.productName}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Sales Quantity
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.salesQuantity}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Bonus Quantity
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.bonusQuantity}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Total Quantity
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.totalQuantity}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Amount
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.value?.toFixed(2)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatDateToReadable(form.date)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Total Day Quantity
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.totalDayQuantity}
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
      {isViewCombineModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            {/* Background Overlay */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsViewCombineModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View Combine Sales Summary
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Product Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.productName}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Sales Quantity
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.salesQuantity}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Bonus Quantity
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.bonusQuantity}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Total Quantity
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.totalQuantity}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Amount
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.value?.toFixed(2)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Total Day Quantity
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.totalDayQuantity}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setIsViewCombineModalOpen(false)}
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

export default SaleSummary;
