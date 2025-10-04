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
  id: "",
  invoiceNumber: "",
  invoiceDate: "",
  deliveryNumber: "",
  receivedDate: "",
  expiredDate: "",
  productName: "",
  type: "",
  packing: "",
  qtyMain: 0,
  qty: 0,
  unitPrice: 0,
  amount: 0,
  otherExpenses: 0,
  totalAmount: 0,
  unitCost: 0,
  remark: "",
};

const requiredHeaders = [
  "invoice #",
  "invoice date",
  "delivery #",
  "received date",
  "expired date",
  "product name",
  "type",
  "packing",
  "qty main",
  "qty",
  "unit price (usd)",
  "amount (usd)",
  "other expenses (usd)",
  "total amount (usd)",
  "remark",
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
      p.type?.toLowerCase() === selectedTab.toLowerCase();

    if (!matchesType) return false;

    if (searchTerm.trim() === "") return true;
    const lowerSearch = searchTerm.toLowerCase();

    return (
      matchesType &&
      (p.invoiceNumber.toLowerCase().includes(lowerSearch) ||
        formatDateToReadable(p.receivedDate)
          .toLowerCase()
          .includes(lowerSearch) ||
        p.type.toLowerCase().includes(lowerSearch) ||
        p.packing.toLowerCase().includes(lowerSearch) ||
        p.unitPrice.toString().includes(lowerSearch) ||
        p.otherExpenses.toString().includes(lowerSearch) ||
        p.qtyMain.toString().includes(lowerSearch) ||
        p.totalAmount.toString().includes(lowerSearch) ||
        p.productName.toLowerCase().includes(lowerSearch))
    );
  });

  const fetchPurchaseDetails = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/purchase`);
      if (!res.ok) throw new Error("Failed to fetch purchase details");

      const data = await res.json();
      const uniqueTypes = Array.from(
        new Set(data.reports.map((item) => item.type.toLowerCase()))
      );
      setTypes(["All", ...uniqueTypes]);
      setPurchases(data.reports);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching purchase details");
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

        // Step 3: Map rows to structured data
        const dataRows = rows.slice(headerRowIndex + 1);
        const mappedData = dataRows
          .map((row) => {
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
              invoiceNumber: item["invoice #"],
              invoiceDate: parseDate(item["invoice date"]),
              deliveryNumber: item["delivery #"],
              receivedDate: parseDate(item["received date"]),
              expiredDate: parseDate(item["expired date"]),
              productName: item["product name"],
              type: item["type"],
              packing: item["packing"],
              qtyMain: parseNumber(item["qty main"]),
              qty: parseNumber(item["qty"]),
              unitPrice: parseNumber(item["unit price (usd)"]),
              amount: parseNumber(item["amount (usd)"]),
              otherExpenses: parseNumber(item["other expenses (usd)"]),
              totalAmount: parseNumber(item["total amount (usd)"]),
              remark: item["remark"],
            };
          })
          .filter((entry) => entry.productName !== "");

        setParsedData(mappedData);
        showToast("success", `Successfully parsed ${mappedData.length} rows`);
      } catch (error) {
        console.error("Error reading Excel file:", error);
        showToast("error", "Failed to process the file.");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handlePurcharseImport = async () => {
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
    setForm({ ...purchase });
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
        console.loog("values of error", error);
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
    if (typeof num === "number") {
      return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return "--";
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
              <th className="p-3">Received Date</th>
              <th className="p-3">Product Name</th>
              <th className="p-3">Type</th>
              <th className="p-3">Packing</th>
              <th className="p-3">Unit Price($)</th>
              <th className="p-3">Other Expenses($) </th>
              <th className="p-3">Quantity</th>
              <th className="p-3">Amount($)</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentPurchases.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-gray-500">
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
                    <td className="p-3">
                      {formatDateToReadable(purchase.receivedDate)}
                    </td>
                    <td className="p-3">{purchase.productName || "--"}</td>
                    <td className="p-3">{purchase.type || "--"}</td>
                    <td className="p-3">{purchase.packing || "--"}</td>
                    <td className="p-3">{formatNumber(purchase.unitPrice)}</td>
                    <td className="p-3">{purchase.otherExpenses || "--"}</td>
                    <td className="p-3">{purchase.qtyMain || "--"}</td>
                    <td className="p-3">
                      {formatNumber(purchase.totalAmount)}
                    </td>
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
                    onClick={handlePurcharseImport}
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
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            {/* Modal Content */}
            <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              {/* Close Button */}
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-6">
                View Purchase Details
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
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
                    Invoice Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatDateToReadable(form.invoiceDate) || "--"}
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
                    Type
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.type || "--"}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Packing
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.packing || "--"}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Qty Main
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.qtyMain || 0}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">Qty</label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.qty || 0}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Unit Price (USD)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatNumber(form.unitPrice)}
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

                <div>
                  <label className="block font-medium text-gray-600">
                    Other Expenses (USD)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatNumber(form.otherExpenses)}
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-gray-600">
                    Total Amount (USD)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatNumber(form.totalAmount)}
                  </p>
                </div>

                {/* <div>
                  <label className="block font-medium text-gray-600">
                    Unit Cost (USD)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatNumber(form.unitCost)}
                  </p>
                </div> */}

                <div className="md:col-span-2">
                  <label className="block font-medium text-gray-600">
                    Remark
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.remark || "—"}
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
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            {/* Modal Box */}
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-screen overflow-y-auto">
              {/* Close Button */}
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Purchase
              </h2>

              {/* Form */}
              <form
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                onSubmit={(e) => e.preventDefault()}
              >
                <div>
                  <label className="block text-sm font-medium">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={form.invoiceNumber || "--"}
                    onChange={(e) =>
                      setForm({ ...form, invoiceNumber: e.target.value })
                    }
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
                    Delivery Number
                  </label>
                  <input
                    type="text"
                    value={form.deliveryNumber || "--"}
                    onChange={(e) =>
                      setForm({ ...form, deliveryNumber: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Received Date
                  </label>
                  <DatePicker
                    selected={parseDate(form.receivedDate) || "--"}
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
                    selected={parseDate(form.expiredDate)}
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

                <div>
                  <label className="block text-sm font-medium">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={capitalizeFirstLetter(form.productName)}
                    onChange={(e) =>
                      setForm({ ...form, productName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Type</label>
                  <input
                    type="text"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Packing</label>
                  <input
                    type="text"
                    value={form.packing}
                    onChange={(e) =>
                      setForm({ ...form, packing: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Qty Main</label>
                  <input
                    type="number"
                    value={form.qtyMain}
                    onChange={(e) =>
                      setForm({ ...form, qtyMain: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    min={0}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Qty</label>
                  <input
                    type="number"
                    value={form.qty}
                    onChange={(e) =>
                      setForm({ ...form, qty: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    min={0}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Unit Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={
                      form.unitPrice !== "" && form.unitPrice !== null
                        ? Number(form.unitPrice).toFixed(2)
                        : ""
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        unitPrice:
                          e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* <div>
                  <label className="block text-sm font-medium">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setForm({
                        ...form,
                        amount: isNaN(val) ? 0 : Number(val.toFixed(1)),
                      });
                    }}
                    className="w-full border px-3 py-2 rounded-lg"
                    min={0}
                  />
                </div> */}

                <div>
                  <label className="block text-sm font-medium">
                    Other Expenses
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.otherExpenses}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        otherExpenses: Number(e.target.value),
                      })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    min={0}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Total Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.totalAmount.toFixed(2)}
                    onChange={(e) =>
                      setForm({ ...form, totalAmount: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    min={0}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium">Remark</label>
                  <textarea
                    value={form.remark}
                    onChange={(e) =>
                      setForm({ ...form, remark: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    rows={3}
                  />
                </div>
              </form>

              {/* Buttons */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePurchaseUpdate}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                  type="button"
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
