import React, { useState, useEffect, useMemo, useCallback } from "react";
import { UserPlus, Trash2, Edit, Upload, X, Eye } from "lucide-react";
import ReactDOM from "react-dom";
import SampleExcelDownloadSale from "../../excels/SampleExcelDownloadSale";
import { handleAxiosError } from "../../utils/errorHandler";
import * as XLSX from "xlsx";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import { useNavigate } from "react-router-dom";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const Sales = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [selectedTab, setSelectedTab] = useState("All");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const salesPerPage = 9;

  const requiredHeaders = [
    "recording date",
    "invoice #",
    "invoice date",
    "mr name",
    "customer code",
    "product name",
    "sales qty",
    "total qty",
    "selling price (usd)",
    "amount (usd)",
    "net selling amount (usd)",
    "credit (days)",
    "due date",
    "delivery date",
    "payment status",
  ];

  const hideRowList = useMemo(
    () => [
      { id: 1, name: "Recording Date", dbName: "recordingDate" },
      { id: 2, name: "Bonus Qty", dbName: "bonusQty" },
      { id: 3, name: "Selling Price (USD)", dbName: "sellingPrice" },
      { id: 4, name: "Discount (USD)", dbName: "discount" },
      { id: 5, name: "Net Selling Amount (USD)", dbName: "netSellingAmount" },
      { id: 6, name: "Average Unit Price (USD)", dbName: "averageUnitPrice" },
      { id: 7, name: "Prof/Loss", dbName: "profitLoss" },
      { id: 8, name: "Credit (Days)", dbName: "creditDays" },
      { id: 9, name: "Due Date", dbName: "dueDate" },
      { id: 10, name: "Delivery Date", dbName: "deliveryDate" },
      { id: 11, name: "Remark", dbName: "remark" },
    ],
    []
  );

  const [form, setForm] = useState({
    _id: null,
    recordingDate: "", // Use ISO string or Date object, initially empty string
    invoiceNumber: "",
    invoiceDate: "",
    mrName: "",
    customerCode: "",
    productName: "",
    salesQty: 0,
    bonusQty: 0,
    totalQty: 0,
    sellingPrice: 0.0,
    amount: 0,
    discount: 0,
    netSellingAmount: 0,
    averageUnitPrice: 0,
    profitLoss: 0,
    creditDays: 0,
    dueDate: "",
    deliveryDate: "",
    paidAmount: 0,
    dueAmount: 0,
    paymentStatus: "",
    remark: "",
  });

  // Reset page when search or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

  // Fetch data on mount
  useEffect(() => {
    fetchSaleSummaries();
  }, []);

  function capitalizeFirstLetter(str) {
    if (!str) return "";
    str = str.toString(); // ensure it's a string
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  // Fetch function
  const fetchSaleSummaries = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/sales`);
      if (!res.ok) throw new Error("Failed to fetch sale summaries");

      const data = await res.json();
      const uniqueTypes = Array.from(
        new Set(data.map((item) => item.paymentStatus?.toLowerCase()))
      );
      setTypes(["All", ...uniqueTypes]);
      setSales(data);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching sale summaries");
    } finally {
      setLoading(false);
    }
  };

  // Memoized filtered sales
  const filteredSales = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();
    const selectedTabLower = selectedTab.toLowerCase();

    return sales.filter((sale) => {
      const paymentStatus = (sale.paymentStatus || "pending").toLowerCase();

      // Tab filter
      if (selectedTabLower !== "all" && selectedTabLower !== paymentStatus) {
        return false;
      }

      if (!lowerSearch) {
        return true;
      }

      // Prepare searchable values
      const fields = [
        sale.invoiceNumber,
        sale.customerInfo?.name,
        sale.productName,
        sale.mrName,
        sale.remarks,
        sale.salesQty != null ? sale.salesQty.toString() : "",
        sale.sellingPrice != null ? sale.sellingPrice.toString() : "",
        sale.amount != null ? sale.amount.toString() : "",
        sale.discount != null ? sale.discount.toString() : "",
        sale.bonusQty != null ? sale.bonusQty.toString() : "",
        sale.netSellingAmount != null ? sale.netSellingAmount.toString() : "",
        sale.averageUnitPrice != null ? sale.averageUnitPrice.toString() : "",
        sale.profitLoss != null ? sale.profitLoss.toString() : "",
        sale.creditDays != null ? sale.creditDays.toString() : "",
        sale.recordingDate
          ? formatDateToReadable(new Date(sale.recordingDate), "dd/MM/yyyy")
          : "",
        sale.dueDate
          ? formatDateToReadable(new Date(sale.dueDate), "dd/MM/yyyy")
          : "",
        sale.deliveryDate
          ? formatDateToReadable(new Date(sale.deliveryDate), "dd/MM/yyyy")
          : "",
      ];

      return fields.some((f) =>
        (f ?? "").toString().toLowerCase().includes(lowerSearch)
      );
    });
  }, [sales, searchTerm, selectedTab]);

  // Memoized current page slice
  const currentSales = useMemo(() => {
    const start = (currentPage - 1) * salesPerPage;
    return filteredSales.slice(start, start + salesPerPage);
  }, [filteredSales, currentPage, salesPerPage]);

  const totalPages = useMemo(
    () => Math.ceil(filteredSales.length / salesPerPage),
    [filteredSales, salesPerPage]
  );
  const visiblePages = useMemo(
    () => getVisiblePages(currentPage, totalPages),
    [currentPage, totalPages]
  );

  // Memoized chunked items
  const chunkedItems = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < hideRowList.length; i += 2) {
      chunks.push(hideRowList.slice(i, i + 2));
    }
    return chunks;
  }, [hideRowList]);

  // Handlers
  const toggleItem = useCallback((id) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const handleSave = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleReset = useCallback(() => {
    setSelectedItems([]);
    setIsModalOpen(false);
  }, []);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
  };

  // Render loading
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50">
        <div className="text-xl font-medium text-gray-600 flex gap-1">
          Loading
          <span className="animate-bounce [animation-delay:0s]">.</span>
          <span className="animate-bounce [animation-delay:0.2s]">.</span>
          <span className="animate-bounce [animation-delay:0.4s]">.</span>
        </div>
      </div>
    );
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        });

        if (rows.length === 0) {
          showToast("warning", "Excel file is empty");
          return;
        }

        // Step 1: Find the header row index
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i].map((cell) =>
            (cell || "").toString().trim().toLowerCase()
          );
          const matched = requiredHeaders.filter((hdr) => row.includes(hdr));
          if (matched.length === requiredHeaders.length) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          const sampleRow = rows.find((_, i) => i < 10) || [];
          const lowerSampleRow = sampleRow.map((cell) =>
            (cell || "").toString().trim().toLowerCase()
          );
          const missing = requiredHeaders.filter(
            (hdr) => !lowerSampleRow.includes(hdr)
          );
          showToast(
            "error",
            `❌ Required headers missing: ${missing.join(", ")}`
          );
          return;
        }

        // Step 2: Map columns to headers
        const rawHeaders = rows[headerRowIndex];
        const headersMap = {};
        rawHeaders.forEach((headerText, colIndex) => {
          const cleaned = headerText?.toString().trim().toLowerCase();
          if (requiredHeaders.includes(cleaned)) {
            headersMap[colIndex] = cleaned;
          }
        });

        // Step 3: Map rows to objects
        const dataRows = rows.slice(headerRowIndex + 1);
        const mappedData = dataRows
          .map((row) => {
            const item = {};
            Object.entries(headersMap).forEach(([colIndex, key]) => {
              item[key] = row[colIndex] || "";
            });
            return {
              recordingDate: item["recording date"],
              invoiceNumber: item["invoice #"],
              invoiceDate: item["invoice date"],
              mrName: item["mr name"],
              customerCode: item["customer code"],
              productName: item["product name"],
              salesQty: item["sales qty"],
              bonusQty: item["bonus qty"],
              totalQty: item["total qty"],
              sellingPrice: item["selling price (usd)"],
              amount: item["amount (usd)"],
              discount: item["discount (usd)"],
              netSellingAmount: item["net selling amount (usd)"],
              averageUnitPrice: item["average unit price (usd)"],
              profitLoss: item["prof/los"],
              creditDays: item["credit (days)"],
              dueDate: item["due date"],
              deliveryDate: item["delivery date"],
              paymentStatus: item["payment status"],
              remark: item["remark"],
            };
          })
          .filter((entry) => entry.productName !== "");

        setParsedData(mappedData);
      } catch (error) {
        console.error("Error reading Excel file:", error);
        showToast("error", "Failed to process the file.");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleProductImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }

    setIsUploading(true);

    try {
      const res = await axios.post(`${backendUrl}/api/sale/import`, parsedData);

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Sale Summary imported successfully!"
        );
        setShowImportModal(false);
        fetchSaleSummaries();
      }
    } catch (err) {
      handleAxiosError(err, showToast);
    } finally {
      setIsUploading(false);
    }
  };

  const editSale = (sale) => {
    setForm({ ...sale });
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  const handleView = (sale) => {
    setForm({ ...sale });
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  const handleUpdateSales = async (e, sale) => {
    e.preventDefault();

    try {
      const res = await axios.put(`${backendUrl}/api/sales/${sale._id}`, sale);
      if (res.status === 200) {
        showToast("success", "Sales record updated successfully");
        setIsEditModalOpen(false);
        fetchSaleSummaries();
      }
    } catch (err) {
      showToast("error", "Failed to update sales record.");
    }
  };

  const deleteSale = async (sale) => {
    if (!sale._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${sale.invoiceNumber}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/sales/${sale._id}`);
        if (res.status === 200) {
          showToast(
            "success",
            `Customer <b>${sale.invoiceNumber}</b> deleted successfully`
          );
          fetchSaleSummaries();
        }
      } catch (error) {
        showToast("error", "Failed to delete customer.");
      }
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> sales`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/sales`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Selected Sales deleted successfully");
          fetchSaleSummaries();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected customers.");
      }
    } else {
      setSelected([]);
    }
  };

  const toggleSelect = (sale) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c.id === sale._id);

      if (exists) {
        return prev.filter((c) => c.id !== sale._id);
      } else {
        return [...prev, { id: sale._id }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentSales.map((s) => ({ id: s._id }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  return (
    <div className="p-6">
      {/* ✅ FIXED: Closed missing </div> */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <div className="flex gap-3 items-center">
          <button
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            onClick={() => navigate("/salelayout/sale/new")}
          >
            <UserPlus size={18} /> Add New Sales
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 cursor-pointer"
          >
            <Upload size={18} /> Import Product
          </button>

          {/* ✅ FIXED: Missing closing bracket for conditional render */}
          {selected.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* ✅ FIXED: Added missing closing parenthesis and braces */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        {sales.length > 0 ? (
          <div className="flex items-center gap-6">
            {/* Tabs */}
            <div className="flex gap-4">
              {types.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setSelectedTab(tab);
                    setCurrentPage(1);
                    setSelected([]);
                  }}
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

            <button
              onClick={() => {
                setIsModalOpen(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded cursor-pointer"
            >
              Add More Column
            </button>
          </div>
        ) : (
          <div></div>
        )}

        {/* ✅ FIXED: Missing closing tag for <p> and <div> */}
        <div className="flex items-center gap-8">
          <p className="text-lg font-semibold text-gray-700">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
              {filteredSales.length}
            </span>
          </p>

          <input
            type="text"
            placeholder="Search invoice, customer, status..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="border px-4 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>
      <div className="container">
        <div className="overflow-x-hidden md:overflow-x-auto whitespace-nowrap shadow">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3">
                  <div className="flex items-center gap-4">
                    {currentSales.length > 0 && (
                      <input
                        type="checkbox"
                        aria-label="Select all sales"
                        checked={
                          selected.length === currentSales.length &&
                          currentSales.length > 0
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    )}
                    <span>Invoice No</span>
                  </div>
                </th>
                <th className="p-3">Invoice Date</th>
                <th className="p-3">Product Name</th>
                <th className="p-3">MR Name</th>
                <th className="p-3">Customer Name</th>
                <th className="p-3">Sales Qty</th>
                <th className="p-3">Selling Price/$</th>
                {hideRowList
                  .filter((item) => selectedItems.includes(item.id))
                  .map((item) => (
                    <th key={item.id} className="p-3">
                      {item.name}
                    </th>
                  ))}
                <th className="p-3">Total Amount ($)</th>
                <th className="p-3">Payment Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentSales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-gray-500">
                    No Sales found.
                  </td>
                </tr>
              ) : (
                currentSales.map((sale, index) => (
                  <tr
                    key={sale._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % salesPerPage === 0 ||
                      index + 1 === currentSales.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === sale._id)}
                          onChange={() => toggleSelect(sale)}
                        />
                        <span className="capitalize">{sale.invoiceNumber}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      {formatDateToReadable(sale.invoiceDate)}
                    </td>
                    <td className="p-3">
                      {capitalizeFirstLetter(sale.productName)}
                    </td>
                    <td className="p-3">
                      {capitalizeFirstLetter(sale.mrName)}
                    </td>
                    <td className="p-3">
                      {capitalizeFirstLetter(sale.customerInfo?.name) || "--"}
                    </td>
                    <td className="p-3">{Math.ceil(sale.salesQty)}</td>
                    <td className="p-3">{Math.ceil(sale.sellingPrice)}</td>
                    {/* Dynamically selected extra columns */}
                    {hideRowList
                      .filter((item) => selectedItems.includes(item.id))
                      .map((item) => (
                        <td key={item.id} className="p-3">
                          {[
                            "recordingDate",
                            "deliveryDate",
                            "dueDate",
                          ].includes(item.dbName)
                            ? formatDateToReadable(sale[item.dbName]) || "--"
                            : sale[item.dbName] ?? "--"}
                        </td>
                      ))}
                    <td className="p-3">{Math.ceil(sale.amount)}</td>
                    <td className="p-3">
                      {capitalizeFirstLetter(sale.paymentStatus)}
                    </td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button className="text-blue-600 hover:text-blue-800 cursor-pointer">
                        <Eye onClick={() => handleView(sale)} size={18} />
                      </button>
                      <button
                        className="text-green-600 hover:text-green-800 cursor-pointer"
                        onClick={() => editSale(sale)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                        onClick={() => deleteSale(sale)}
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => setShowImportModal(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                disabled={isUploading}
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-semibold mb-4">Import Products</h2>
              {isSampleFile && <SampleExcelDownloadSale />}
              <input
                type="file"
                accept=".csv, .xlsx"
                onChange={handleFileUpload}
                className="block w-full border rounded-lg px-3 py-2 mb-6"
              />
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
                  onClick={handleProductImport}
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

      {currentSales.length > 0 && (
        <div className="mt-4 p-5 flex justify-start gap-2">
          <button
            onClick={() => {
              setCurrentPage((prev) => {
                const prevPage = Math.max(prev - 1, 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
                return prevPage;
              });
            }}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
          >
            Prev
          </button>

          {visiblePages.map((page, idx) =>
            page === "..." ? (
              <span
                key={`sales-ellipsis-${idx}`}
                className="px-3 py-1 text-gray-500 select-none cursor-pointer"
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => {
                  setCurrentPage(page);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
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
              setCurrentPage((prev) => {
                const nextPage = Math.min(prev + 1, totalPages);
                window.scrollTo({ top: 0, behavior: "smooth" });
                return nextPage;
              });
            }}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}

      {/* ✅ COLUMN SELECT MODAL FIX */}
      {isModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <div
              className="relative bg-white p-6 rounded shadow-lg max-w-xl w-full z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-semibold mb-4">Select Columns</h2>
              <div className="grid grid-cols-1 gap-3">
                {chunkedItems.map((pair, index) => (
                  <div key={index} className="flex gap-4">
                    {pair.map(({ id, name }) => (
                      <label
                        key={id}
                        className="flex items-center gap-2 flex-1 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={selectedItems.includes(id)}
                          onChange={() => toggleItem(id)}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-between items-center">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 cursor-pointer"
                >
                  Reset
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            {/* Background Overlay */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Sales Record
              </h2>

              <form className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Recording Date
                  </label>
                  <DatePicker
                    selected={
                      form.recordingDate ? new Date(form.recordingDate) : null
                    }
                    onChange={(date) =>
                      date
                        ? setForm({
                            ...form,
                            recordingDate: date.toISOString(),
                          })
                        : setForm({ ...form, recordingDate: "" })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={form.invoiceNumber}
                    onChange={(e) =>
                      setForm({ ...form, invoiceNumber: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Invoice Date
                  </label>
                  <DatePicker
                    selected={
                      form.invoiceDate ? new Date(form.invoiceDate) : null
                    }
                    onChange={(date) =>
                      date
                        ? setForm({ ...form, invoiceDate: date.toISOString() })
                        : setForm({ ...form, invoiceDate: "" })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">MR Name</label>
                  <input
                    type="text"
                    value={form.mrName}
                    onChange={(e) =>
                      setForm({ ...form, mrName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Customer Code
                  </label>
                  <input
                    type="text"
                    value={form.customerCode}
                    onChange={(e) =>
                      setForm({ ...form, customerCode: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                  />
                </div>

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
                  />
                </div>

                {/* Numeric inputs with min=0 */}
                <div>
                  <label className="block text-sm font-medium">
                    Sales Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.salesQty}
                    onChange={(e) =>
                      setForm({ ...form, salesQty: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Bonus Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.bonusQty}
                    onChange={(e) =>
                      setForm({ ...form, bonusQty: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Total Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.totalQty}
                    onChange={(e) =>
                      setForm({ ...form, totalQty: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Selling Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.sellingPrice}
                    onChange={(e) =>
                      setForm({ ...form, sellingPrice: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Discount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.discount}
                    onChange={(e) =>
                      setForm({ ...form, discount: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Net Selling Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.netSellingAmount}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        netSellingAmount: Number(e.target.value),
                      })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Average Unit Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.averageUnitPrice}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        averageUnitPrice: Number(e.target.value),
                      })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Profit / Loss
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.profitLoss}
                    onChange={(e) =>
                      setForm({ ...form, profitLoss: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Credit Days
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.creditDays}
                    onChange={(e) =>
                      setForm({ ...form, creditDays: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Due Date</label>
                  <DatePicker
                    selected={form.dueDate ? new Date(form.dueDate) : null}
                    onChange={(date) =>
                      date
                        ? setForm({ ...form, dueDate: date.toISOString() })
                        : setForm({ ...form, dueDate: "" })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Delivery Date
                  </label>
                  <DatePicker
                    selected={
                      form.deliveryDate ? new Date(form.deliveryDate) : null
                    }
                    onChange={(date) =>
                      date
                        ? setForm({ ...form, deliveryDate: date.toISOString() })
                        : setForm({ ...form, deliveryDate: "" })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Paid Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.paidAmount}
                    onChange={(e) =>
                      setForm({ ...form, paidAmount: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Due Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.dueAmount}
                    onChange={(e) =>
                      setForm({ ...form, dueAmount: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Payment Status
                  </label>
                  <input
                    type="text"
                    value={form.paymentStatus}
                    onChange={(e) =>
                      setForm({ ...form, paymentStatus: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium">Remark</label>
                  <input
                    type="text"
                    value={form.remark}
                    onChange={(e) =>
                      setForm({ ...form, remark: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                  />
                </div>

                <div className="md:col-span-2 mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                    onClick={(e) => handleUpdateSales(e, form)}
                  >
                    Update
                  </button>
                </div>
              </form>
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

            {/* Modal Content */}
            <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View Sales Record
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                {/* Fixed fields */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Recording Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.recordingDate
                      ? new Date(form.recordingDate).toLocaleDateString()
                      : "-"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Invoice Number
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.invoiceNumber || "-"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Invoice Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.invoiceDate
                      ? new Date(form.invoiceDate).toLocaleDateString()
                      : "-"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    MR Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.mrName || "-"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Customer Code
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.customerCode || "-"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Product Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.productName || "-"}
                  </p>
                </div>

                {/* Numeric Fields */}
                {[
                  ["Sales Quantity", "salesQty"],
                  ["Bonus Quantity", "bonusQty"],
                  ["Total Quantity", "totalQty"],
                  ["Selling Price", "sellingPrice"],
                  ["Amount", "amount"],
                  ["Discount", "discount"],
                  ["Net Selling Amount", "netSellingAmount"],
                  ["Average Unit Price", "averageUnitPrice"],
                  ["Profit / Loss", "profitLoss"],
                  ["Credit Days", "creditDays"],
                  ["Paid Amount", "paidAmount"],
                  ["Due Amount", "dueAmount"],
                ].map(([label, key]) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-600">
                      {label}
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form[key] ?? 0}
                    </p>
                  </div>
                ))}

                {/* Date Fields */}
                {[
                  ["Due Date", "dueDate"],
                  ["Delivery Date", "deliveryDate"],
                ].map(([label, key]) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-600">
                      {label}
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form[key]
                        ? new Date(form[key]).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>
                ))}

                {/* Payment Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Payment Status
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.paymentStatus || "-"}
                  </p>
                </div>

                {/* Remark - full width */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Remark
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.remark || "-"}
                  </p>
                </div>
              </div>

              {/* Footer */}
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

export default Sales;
