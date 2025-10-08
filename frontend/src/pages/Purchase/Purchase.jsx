import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { UserPlus, Trash2, Edit, Upload, X, Eye, Search } from "lucide-react";
import ReactDOM from "react-dom";
import PurchaseInventoryExcelDownload from "../../excels/SampleExcelDownloadPurcharsing";
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

const initialFormState = {
  _id: "",
  invoiceNumber: "",
  invoiceDate: "",
  deliveryNumber: "",
  receivedDate: "",
  expiredDate: "",
  productName: "",
  qtyBox: 0,
  qtyPerCarton: 0,
  fob: 0,
  cif: 0,
  lcNumber: "",
  remarks: "",
  amount: 0,
};

const requiredHeaders = [
  "invoice #",
  "invoice date",
  "delivery #",
  "received date",
  "expired date",
  "product name",
  "qty box",
  "qty per carton",
  "fob",
  "cif",
  "lc number",
  "remarks",
];

// Define which fields should be treated as numbers
const numericFields = [
  "qtyBox",
  "qtyPerCarton",
  "fob",
  "cif",
  "amount",
];

function Purchase() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [selectedTab, setSelectedTab] = useState("All");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [form, setForm] = useState(initialFormState);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef(null);

  const purchasesPerPage = 10;

  // Filter purchases based on tab + search
  const filteredPurchases = purchases.filter((p) => {
    const matchesType =
      selectedTab.toLowerCase() === "all" ||
      p.productType?.toLowerCase() === selectedTab.toLowerCase();

    if (!matchesType) return false;

    if (searchTerm.trim() === "") return true;
    const lowerSearch = searchTerm.toLowerCase();

    return (
      matchesType &&
      (p.invoiceNumber.toLowerCase().includes(lowerSearch) ||
        formatDateToReadable(p.receivedDate)
          .toLowerCase()
          .includes(lowerSearch) ||
        p.productName.toLowerCase().includes(lowerSearch) ||
        p.deliveryNumber.toLowerCase().includes(lowerSearch) ||
        p.lcNumber.toLowerCase().includes(lowerSearch))
    );
  });

  const fetchPurchaseDetails = async () => {
    try {
      setLoading(true);

      const purchaseRes = await fetch(`${backendUrl}/api/purchase`);
      if (!purchaseRes.ok) throw new Error("Failed to fetch purchase details");
      const purchaseData = await purchaseRes.json();

      // Extract unique types from both productType and type fields
      const typeSet = new Set();
      purchaseData.reports.forEach((item) => {
        const type = item.productType || item.type;
        if (type && type.trim() && type.toLowerCase() !== "unknown") {
          typeSet.add(type.trim());
        }
      });

      const uniqueTypes = Array.from(typeSet).sort();

      setTypes(["All", ...uniqueTypes]);
      setPurchases(purchaseData.reports || []);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      alert(error.message || "Error fetching purchase details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchaseDetails();
  }, []);

  const handleClick = (tab) => {
    setSelectedTab(tab);
    setCurrentPage(1);
  };

  const parseNumber = (val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const cleaned = val.replace(/,/g, "").trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const parseDate = (val) => {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val === "string") {
      if (val.toUpperCase() === "N/A" || val.trim() === "") return null;
      const parsed = new Date(val);
      if (!isNaN(parsed)) return parsed;
    }

    if (typeof val === "number") {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(date)) return date;
    }
    return null;
  };

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

        // Updated required headers for your new format
        const requiredHeaders = [
          "no",
          "invoice number",
          "invoice date",
          "delivery no.",
          "received date",
          "product name",
          "expiry date",
          "qty box",
          "qty per carton",
          "fob",
          "cif",
          "lc number",
          "remarks",
        ];

        // Step 1: Find the header row index
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i].map((cell) =>
            (cell || "").toString().trim().toLowerCase()
          );

          const matched = requiredHeaders.filter((hdr) => row.includes(hdr));
          // Require at least 8 matching headers to be flexible
          if (matched.length >= 8) {
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

        // Step 3: Map rows to structured data
        const dataRows = rows.slice(headerRowIndex + 1);
        const mappedData = dataRows
          .map((row, index) => {
            const item = {};
            Object.entries(headersMap).forEach(([colIndex, key]) => {
              let cellVal = row[colIndex] || "";
              if (typeof cellVal === "string") {
                if (cellVal.toUpperCase() === "N/A" || cellVal.trim() === "") {
                  cellVal = "";
                }
              }
              item[key] = cellVal;
            });

            return {
              invoiceNumber: item["invoice number"] || "",
              invoiceDate: parseDate(item["invoice date"]),
              deliveryNumber: item["delivery no."] || "",
              receivedDate: parseDate(item["received date"]),
              expiredDate: parseDate(item["expiry date"]),
              productName: item["product name"] || "",
              qtyBox: parseNumber(item["qty box"]),
              qtyPerCarton: parseNumber(item["qty per carton"]),
              fob: parseNumber(item["fob"]),
              cif: parseNumber(item["cif"]),
              lcNumber: item["lc number"] || "",
              remarks: item["remarks"] || "",
            };
          })
          .filter(
            (entry) =>
              entry.invoiceNumber !== "" ||
              entry.productName !== "" ||
              entry.deliveryNumber !== ""
          ); // Filter out completely empty rows

        setParsedData(mappedData);
      } catch (error) {
        console.error("Error reading Excel file:", error);
        showToast("error", "Failed to process the file.");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handlePurchaseImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }

    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/purchase/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Purchase Inventory imported successfully!"
        );
        setShowImportModal(false);
        fetchPurchaseDetails();
      }
    } catch (err) {
      handleAxiosError(err, showToast);
    } finally {
      setIsUploading(false);
    }
  };

  const editPurchase = (purchase) => {
    setForm({ 
      ...purchase,
      // Ensure numeric values are properly formatted
      qtyBox: purchase.qtyBox || 0,
      qtyPerCarton: purchase.qtyPerCarton || 0,
      fob: purchase.fob || 0,
      cif: purchase.cif || 0,
      amount: purchase.amount || 0,
    });
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  const handleView = (purchases) => {
    setForm({ ...purchases });
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  const deletePurchase = async (purchase) => {
    if (!purchase._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${purchase.productName}-${purchase?.invoiceNumber}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/purchase/${purchase._id}`
        );
        if (res.status === 200) {
          showToast(
            "success",
            `Purcharse <b>${purchase.productName}-${purchase?.invoiceNumber}</b> deleted successfully`
          );
          fetchPurchaseDetails();
        }
      } catch (error) {
        console.log("values of error", error);
        showToast("error", "Failed to delete purchase.");
      }
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> purchase`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/purchase`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast(
            "success",
            `Selected <b>${selected.length}</b> purchase deleted successfully`
          );
          fetchPurchaseDetails();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected .");
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

  const formatNumber = (num) => {
    if (num === null || num === undefined || num === "") return "--";
    
    const numberValue = typeof num === 'string' ? parseFloat(num) : num;
    
    if (isNaN(numberValue)) return "--";
    
    return numberValue.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const totalPages = Math.ceil(filteredPurchases.length / purchasesPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentPurchases = filteredPurchases.slice(
    (currentPage - 1) * purchasesPerPage,
    currentPage * purchasesPerPage
  );

  function capitalizeFirstLetter(str) {
    if (!str) return "";
    str = str.toString(); // ensure it's a string
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  const handlePurchaseUpdate = async (e) => {
    e.preventDefault();

    try {
      const res = await axios.put(
        `${backendUrl}/api/purchase/${form._id}`,
        form
      );

      if (res.status === 200) {
        showToast("success", "Purchase updated successfully");
        setIsEditModalOpen(false);
        fetchPurchaseDetails();
      }
    } catch (err) {
      console.error("Update error:", err);
      showToast("error", "Failed to update product.");
    }
  };

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? currentPurchases.map((purchase) => ({
              id: purchase._id,
            }))
          : []
      );
    },
    [currentPurchases]
  );

  // Calculate amount when lcNumber or qtyBox changes - FIXED VERSION
  useEffect(() => {
    if (isEditModalOpen) {
      const lcValue = parseFloat(form.lcNumber) || 0;
      const qtyBoxValue = parseFloat(form.qtyBox) || 0;
      const amount = lcValue * qtyBoxValue;
      
      // Round to 2 decimal places
      const roundedAmount = Math.round(amount * 100) / 100;

      setForm((prev) => ({
        ...prev,
        amount: roundedAmount,
      }));
    }
  }, [form.lcNumber, form.qtyBox, isEditModalOpen]);

  // Numeric input handler - IMPROVED VERSION
  const handleNumericInputChange = (e, updateFunc) => {
    const { name, value } = e.target;

    // For numeric fields, allow only numbers and decimal point
    if (numericFields.includes(name)) {
      // Allow empty, numbers, and decimal point with proper format
      if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
        const validatedEvent = {
          target: {
            name: name,
            value: value,
          },
        };
        updateFunc(validatedEvent);
      }
    } else {
      // For non-numeric fields, pass through directly
      updateFunc(e);
    }
  };

  // Enhanced handle change with proper number conversion - FIXED VERSION
  const enhancedHandleChange = useCallback((e) => {
    const { name, value } = e.target;

    setForm((prev) => {
      let processedValue = value;

      // Convert numeric fields to numbers when they're complete
      if (numericFields.includes(name)) {
        if (value === "" || value === "-") {
          processedValue = value; // Keep as string for intermediate input
        } else if (!value.endsWith(".")) {
          const numValue = parseFloat(value);
          processedValue = isNaN(numValue) ? 0 : numValue;
        }
        // If value ends with ".", keep it as string to allow decimal input
      }

      return {
        ...prev,
        [name]: processedValue,
      };
    });
  }, []);

  // Format numeric values for display in edit modal
  const getDisplayValue = (fieldName, value) => {
    if (!numericFields.includes(fieldName)) return value || "";
    
    if (value === null || value === undefined) return "";
    
    // If it's a number and we're not in the middle of typing a decimal
    if (typeof value === 'number') {
      return value.toString();
    }
    
    // If it's a string (like during input), return as is
    return value;
  };

  return (
    <div className="p-6">
      {/* Top Buttons + Search */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <div className="flex gap-3 items-center">
          <button
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            onClick={() => navigate("/purchaselayout/purchase/new")}
          >
            <UserPlus size={18} /> Add New Purchase
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Upload size={18} /> Import Purchase
          </button>

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
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        {purchases.length > 0 ? (
          <div className="flex gap-4">
            {types.map((tab) => (
              <button
                key={tab}
                onClick={() => handleClick(tab)}
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
        ) : (
          <div></div>
        )}

        <div className="flex items-center gap-8">
          <p className="text-lg font-semibold text-gray-700">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
              {filteredPurchases.length}
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
              placeholder="Search invoice,Product Name , Received Date..."
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
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3">
                <div className="flex items-center gap-4">
                  {currentPurchases.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="Select all sales"
                      checked={
                        selected.length === currentPurchases.length &&
                        currentPurchases.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  )}
                  <span>Invoice Number</span>
                </div>
              </th>
              <th className="p-3">Delivery No</th>
              <th className="p-3">Invoice Date</th>
              <th className="p-3">Received Date</th>
              <th className="p-3">Product Name</th>
              <th className="p-3">Box Qty</th>
              <th className="p-3">Qty per Carton</th>
              <th className="p-3">LC</th>
              <th className="p-3">FOB</th>
              <th className="p-3">Amount($)</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentPurchases.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-4 text-gray-500">
                  No purchases found.
                </td>
              </tr>
            ) : (
              currentPurchases.map((purchase, index) => {
                return (
                  <tr
                    key={purchase._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % purchasesPerPage === 0 ||
                      index + 1 === currentPurchases.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    <td className="p-3 text-center">
                      <div className="flex gap-4">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === purchase._id)}
                          onChange={() => toggleSelect(purchase)}
                        />
                        <span>{purchase.invoiceNumber || "--"}</span>
                      </div>
                    </td>
                    <td className="p-3">{purchase.deliveryNumber || "--"}</td>
                    <td className="p-3">
                      {formatDateToReadable(purchase.invoiceDate)}
                    </td>
                    <td className="p-3">
                      {formatDateToReadable(purchase.receivedDate)}
                    </td>
                    <td className="p-3">{purchase.productName || "--"}</td>
                    <td className="p-3">{purchase.qtyBox || "--"}</td>
                    <td className="p-3">{purchase.qtyPerCarton}</td>
                    <td className="p-3">
                      {formatNumber(Number(purchase.lcNumber)) || "--"}
                    </td>
                    <td className="p-3">
                      {formatNumber(purchase.fob) || "--"}
                    </td>

                    <td className="p-3">{formatNumber(purchase.amount)}</td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-blue-600 hover:text-blue-800 cursor-pointer"
                        onClick={() => handleView(purchase)}
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        className="text-green-600 hover:text-green-800"
                        onClick={() => editPurchase(purchase)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800"
                        onClick={() => deletePurchase(purchase)}
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
                  Import Purchase
                </h2>
                {isSampleFile && <PurchaseInventoryExcelDownload />}
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
                    onClick={handlePurchaseImport}
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

        {currentPurchases.length > 0 && (
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

      {/* VIEW MODAL */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-6">
                View Purchase Details
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <label className="block font-medium text-gray-600">
                    Invoice Number
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.invoiceNumber || "--"}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Delivery Number
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.deliveryNumber || "--"}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Invoice Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatDateToReadable(form.invoiceDate) || "--"}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Received Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatDateToReadable(form.receivedDate) || "--"}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Expired Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatDateToReadable(form.expiredDate) || "--"}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Product Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.productName || "--"}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Box Quantity
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.qtyBox || 0}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Quantity Per Carton
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.qtyPerCarton || 0}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    FOB (USD)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatNumber(form.fob)}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    CIF (USD)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatNumber(form.cif)}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    LC Number
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatNumber(Number(form.lcNumber)) || "--"}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Amount (USD)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatNumber(form.amount)}
                  </p>
                </div>

                {/* Remarks - Full width */}
                <div className="md:col-span-3">
                  <label className="block font-medium text-gray-600">
                    Remarks
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.remarks || "—"}
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

      {/* EDIT MODAL - FIXED VERSION */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative max-h-screen overflow-y-auto">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Purchase
              </h2>

              <form
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
                onSubmit={(e) => e.preventDefault()}
              >
                {/* Invoice Number - Text field */}
                <div>
                  <label className="block text-sm font-medium">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    name="invoiceNumber"
                    value={form.invoiceNumber || ""}
                    onChange={enhancedHandleChange}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* Delivery Number - Text field */}
                <div>
                  <label className="block text-sm font-medium">
                    Delivery Number
                  </label>
                  <input
                    type="text"
                    name="deliveryNumber"
                    value={form.deliveryNumber || ""}
                    onChange={enhancedHandleChange}
                    className="w-full border px-3 py-2 rounded-lg"
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
                      setForm({
                        ...form,
                        invoiceDate: date ? date.toISOString() : "",
                      })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select date"
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Received Date
                  </label>
                  <DatePicker
                    selected={
                      form.receivedDate ? new Date(form.receivedDate) : null
                    }
                    onChange={(date) =>
                      setForm({
                        ...form,
                        receivedDate: date ? date.toISOString() : "",
                      })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select date"
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Expired Date
                  </label>
                  <DatePicker
                    selected={
                      form.expiredDate ? new Date(form.expiredDate) : null
                    }
                    onChange={(date) =>
                      setForm({
                        ...form,
                        expiredDate: date ? date.toISOString() : "",
                      })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select date"
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* Product Name - Text field */}
                <div>
                  <label className="block text-sm font-medium">
                    Product Name
                  </label>
                  <input
                    type="text"
                    name="productName"
                    value={form.productName || ""}
                    onChange={enhancedHandleChange}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* Box Quantity - Numeric field (integer) */}
                <div>
                  <label className="block text-sm font-medium">
                    Box Quantity
                  </label>
                  <input
                    type="text"
                    name="qtyBox"
                    value={getDisplayValue("qtyBox", form.qtyBox)}
                    onChange={(e) =>
                      handleNumericInputChange(e, enhancedHandleChange)
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* Quantity Per Carton - Numeric field (integer) */}
                <div>
                  <label className="block text-sm font-medium">
                    Quantity Per Carton
                  </label>
                  <input
                    type="text"
                    name="qtyPerCarton"
                    value={getDisplayValue("qtyPerCarton", form.qtyPerCarton)}
                    onChange={(e) =>
                      handleNumericInputChange(e, enhancedHandleChange)
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* FOB - Numeric field (4 decimal places) */}
                <div>
                  <label className="block text-sm font-medium">FOB (USD)</label>
                  <input
                    type="text"
                    name="fob"
                    value={getDisplayValue("fob", form.fob)}
                    onChange={(e) =>
                      handleNumericInputChange(e, enhancedHandleChange)
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* CIF - Numeric field (4 decimal places) */}
                <div>
                  <label className="block text-sm font-medium">CIF (USD)</label>
                  <input
                    type="text"
                    name="cif"
                    value={getDisplayValue("cif", form.cif)}
                    onChange={(e) =>
                      handleNumericInputChange(e, enhancedHandleChange)
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* LC Number - Text field */}
                <div>
                  <label className="block text-sm font-medium">LC Number</label>
                  <input
                    type="text"
                    name="lcNumber"
                    value={form.lcNumber || ""}
                    onChange={enhancedHandleChange}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* Amount - Numeric field (2 decimal places, readonly) - FIXED */}
                <div>
                  <label className="block text-sm font-medium">
                    Amount (USD)
                  </label>
                  <input
                    type="text"
                    name="amount"
                    value={form.amount ? parseFloat(form.amount).toFixed(2) : "0.00"}
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100"
                    readOnly
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Calculated: LC Number × Box Quantity
                  </p>
                </div>

                {/* Remarks - Full width */}
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium">Remarks</label>
                  <textarea
                    name="remarks"
                    value={form.remarks || ""}
                    onChange={enhancedHandleChange}
                    className="w-full border px-3 py-2 rounded-lg"
                    rows={3}
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
                  onClick={handlePurchaseUpdate}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                >
                  Update
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default Purchase;