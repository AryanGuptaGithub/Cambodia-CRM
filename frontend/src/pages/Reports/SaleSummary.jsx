import React, { useState, useRef, useEffect } from "react";
import { Search, UserPlus, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SampleExcelDownloadDailySummaryReport from "../../excels/SampleExcelDownloadDailySummary";
import ReactDOM from "react-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";

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
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

  console.log("✅ values of dailySummaries", dailySummaries);

  // Convert search term to lowercase once for efficiency
  const search = searchTerm.toLowerCase();

  // Filter daily summaries based on matching products
  const filteredDailySummaries = dailySummaries
    .map((item) => {
      // Filter products within each daily summary item
      const filteredProducts = item.products.filter((product) => {
        return (
          product.productName?.toLowerCase().includes(search) ||
          product.salesQuantity?.toString().includes(search) ||
          product.bonusQuantity?.toString().includes(search)
        );
      });

      // If any product matches, return a new item with filtered products
      if (filteredProducts.length > 0) {
        return {
          ...item,
          products: filteredProducts,
        };
      }

      // Otherwise, exclude the item
      return null;
    })
    .filter(Boolean); // Remove nulls from non-matching items
  const totalPages = Math.ceil(
    filteredDailySummaries.length / saleSummaryPerPage
  );

  const currentDailySummaries = filteredDailySummaries.slice(
    (currentPage - 1) * saleSummaryPerPage,
    currentPage * saleSummaryPerPage
  );
  console.log('valueso f currentDailySummaries', currentDailySummaries);

  const fetchDailySummary = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${backendUrl}/api/dailysummary`);
      if (!response.ok) throw new Error("Failed to fetch daily summaries.");

      const data = await response.json();
      setDailySummaries(data);
      setSelected([]); // Clear any selection
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
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> customers`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/customers`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Selected customers deleted successfully");
          const updated = await fetch(`${backendUrl}/api/customers`);
          const data = await updated.json();
          setCustomers(data.customers);
          setNextCustomerCode(data.nextCustomerCode);
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected customers.");
      }
    } else {
      setSelected([]);
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
    console.log("values of parse", parsedData);
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

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/masterlayout/customer/new")}
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
        <div className="flex justify-between items-center mb-4 gap-8">
          <p className="text-lg font-semibold text-gray-700">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
              {filteredDailySummaries.length}
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
      </div>

      {/* Table */}
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
            </tr>
          </thead>
          <tbody>
            {currentDailySummaries.length > 0 ? (
              currentDailySummaries
                .map((item) => {
                  const entryDate = formatDateToReadable(item.date);
                  return item.products.map((product, index) => {
                    console.log("values of product", product);
                    const isSelected = selected.some(
                      (s) =>
                        s.productName === product.productName &&
                        s.date === item.date
                    );

                    return (
                      <tr
                        key={`${item._id}-${index}`}
                        className={`hover:bg-gray-50 ${
                          (index + 1) % saleSummaryPerPage === 0 ||
                          index + 1 === currentDailySummaries.length
                            ? ""
                            : "border-b"
                        } text-sm`}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() =>
                                toggleSelect({
                                  ...product,
                                  date: item.date,
                                })
                              }
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
                          ₹{product.value?.toFixed(2)}
                        </td>
                        <td className="p-3">{item.totalDayQuantity}</td>
                      </tr>
                    );
                  });
                })
                .flat()
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

      {/* Pagination */}
      <div className="mt-4 flex justify-center gap-2 text-sm">
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
        >
          Prev
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            onClick={() => setCurrentPage(page)}
            className={`px-3 py-1 rounded ${
              currentPage === page
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 hover:bg-gray-300"
            }`}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
        >
          Next
        </button>
      </div>
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
    </div>
  );
};

export default SaleSummary;
