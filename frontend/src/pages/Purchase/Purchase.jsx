import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  UserPlus,
  Trash2,
  Edit,
  Upload,
  X,
  Eye,
  Search,
  Settings,
} from "lucide-react";
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
  supplierName: "",
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
  "supplier name",
  "qty box",
  "qty per carton",
  "fob",
  "cif",
  "lc number",
  "remarks",
];

// Define which fields should be treated as numbers
const numericFields = ["qtyBox", "qtyPerCarton", "fob", "cif", "amount"];

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [activeTab, setActiveTab] = useState("add");
  const [allSelected, setAllSelected] = useState(false);
  const inputRef = useRef(null);

  const purchasesPerPage = 10;

  // Column configuration
  const [tableColumns, setTableColumns] = useState([
    "invoiceNumber",
    "deliveryNumber",
    "productName",
    "supplierName",
    "qtyBox",
    "lcNumber",
    "amount",
    "actions",
  ]);

  const allFields = useMemo(
    () => [
      {
        id: "invoiceNumber",
        name: "Invoice Number",
        dbName: "invoiceNumber",
      },
      {
        id: "deliveryNumber",
        name: "Delivery Number",
        dbName: "deliveryNumber",
      },
      {
        id: "invoiceDate",
        name: "Invoice Date",
        dbName: "invoiceDate",
      },
      {
        id: "receivedDate",
        name: "Received Date",
        dbName: "receivedDate",
      },
      {
        id: "expiredDate",
        name: "Expired Date",
        dbName: "expiredDate",
      },
      {
        id: "productName",
        name: "Product Name",
        dbName: "productName",
      },
      {
        id: "supplierName",
        name: "Supplier Name",
        dbName: "supplierName",
      },
      {
        id: "qtyBox",
        name: "Box Qty",
        dbName: "qtyBox",
      },
      {
        id: "qtyPerCarton",
        name: "Qty per Carton",
        dbName: "qtyPerCarton",
      },
      {
        id: "lcNumber",
        name: "LC",
        dbName: "lcNumber",
      },
      {
        id: "fob",
        name: "FOB (USD)",
        dbName: "fob",
      },
      {
        id: "cif",
        name: "CIF (USD)",
        dbName: "cif",
      },
      {
        id: "amount",
        name: "Amount ($)",
        dbName: "amount",
      },
      {
        id: "remarks",
        name: "Remarks",
        dbName: "remarks",
      },
      {
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    []
  );

  const requiredColumns = ["invoiceNumber", "productName", "actions"];

  // Get available columns for Add tab (columns not currently in table)
  const availableColumns = useMemo(() => {
    return allFields.filter((item) => !tableColumns.includes(item.id));
  }, [allFields, tableColumns]);

  const removableColumns = useMemo(() => {
    return allFields.filter(
      (item) =>
        tableColumns.includes(item.id) && !requiredColumns.includes(item.id)
    );
  }, [allFields, tableColumns]);

  const chunkedItems = useMemo(() => {
    const items = activeTab === "add" ? availableColumns : removableColumns;
    const chunks = [];
    for (let i = 0; i < items.length; i += 2) {
      chunks.push(items.slice(i, i + 2));
    }
    return chunks;
  }, [activeTab, availableColumns, removableColumns]);

  // Toggle item selection
  const toggleItem = (id) => {
    if (id === "all") {
      if (allSelected) {
        setSelectedItems([]);
        setAllSelected(false);
      } else {
        const allIds = chunkedItems.flat().map((item) => item.id);
        setSelectedItems(allIds);
        setAllSelected(true);
      }
    } else {
      let updatedItems;
      if (selectedItems.includes(id)) {
        updatedItems = selectedItems.filter((itemId) => itemId !== id);
      } else {
        updatedItems = [...selectedItems, id];
      }

      setSelectedItems(updatedItems);
      setAllSelected(updatedItems.length === chunkedItems.flat().length);
    }
  };

  // Handle save for column configuration
  const handleSave = () => {
    if (activeTab === "add") {
      // Add selected columns to table
      const newColumns = [...tableColumns, ...selectedItems];
      setTableColumns(newColumns);
    } else {
      const newColumns = tableColumns.filter(
        (id) => !selectedItems.includes(id) || requiredColumns.includes(id)
      );
      setTableColumns(newColumns);
    }
    setSelectedItems([]);
    setAllSelected(false);
    setIsModalOpen(false);
  };

  const handleReset = () => {
    setSelectedItems([]);
    setAllSelected(false);
    // Reset to default columns
    setTableColumns([
      "invoiceNumber",
      "deliveryNumber",
      "invoiceDate",
      "receivedDate",
      "productName",
      "supplierName",
      "qtyBox",
      "qtyPerCarton",
      "lcNumber",
      "fob",
      "amount",
      "actions",
    ]);
  };

  const handleCancelEvent = () => {
    setSelectedItems([]);
    setAllSelected(false);
    setIsModalOpen(false);
  };

  // Get field value from purchase object
  const getFieldValue = (purchase, dbName) => {
    if (["receivedDate", "expiredDate", "invoiceDate"].includes(dbName)) {
      return formatDateToReadable(purchase[dbName]) || "--";
    }

    if (dbName === "amount") {
      return Math.ceil(purchase.amount || 0);
    }

    if (dbName === "qtyBox" || dbName === "qtyPerCarton") {
      return Math.ceil(purchase[dbName] || 0);
    }

    if (dbName === "lcNumber") {
      return formatNumber(Number(purchase[dbName])) || "--";
    }

    if (dbName === "fob" || dbName === "cif") {
      return formatNumber(purchase[dbName]) || "--";
    }

    return purchase[dbName] ?? "--";
  };

  // Update allSelected state when individual selections change
  useEffect(() => {
    const currentItems = chunkedItems.flat();
    if (
      currentItems.length > 0 &&
      selectedItems.length === currentItems.length
    ) {
      setAllSelected(true);
    } else {
      setAllSelected(false);
    }
  }, [selectedItems, chunkedItems]);

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
      (p.invoiceNumber?.toLowerCase().includes(lowerSearch) ||
        formatDateToReadable(p.receivedDate)
          .toLowerCase()
          .includes(lowerSearch) ||
        p.productName?.toLowerCase().includes(lowerSearch) ||
        p.deliveryNumber?.toLowerCase().includes(lowerSearch) ||
        p.lcNumber?.toLowerCase().includes(lowerSearch) ||
        p.supplierName?.toLowerCase().includes(lowerSearch))
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
          "delivery no.",
          "received date",
          "product name",
          "supplier name",
          "expiry date",
          "lc number",
          "amount",
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
              supplierName: item["supplier name"] || "",
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

    const numberValue = typeof num === "string" ? parseFloat(num) : num;

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
    if (typeof value === "number") {
      return value.toString();
    }

    // If it's a string (like during input), return as is
    return value;
  };

  return (
    <div className="p-6">
      <div className="container">
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
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Trash2 size={18} /> Delete
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          {purchases.length > 0 ? (
            <div className="flex items-center gap-6">
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

              <button
                className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                onClick={() => setIsModalOpen(true)}
              >
                <Settings size={18} /> Add /Remove Column
              </button>
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
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {allFields
                  .filter((item) => tableColumns.includes(item.id))
                  .map((item) => (
                    <th
                      key={item.id}
                      className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium"
                    >
                      {item.id === "invoiceNumber" ? (
                        <div className="flex items-center gap-4">
                          {currentPurchases.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label="Select all purchases"
                              checked={
                                selected.length === currentPurchases.length &&
                                currentPurchases.length > 0
                              }
                              onChange={(e) =>
                                toggleSelectAll(e.target.checked)
                              }
                            />
                          )}
                          <span>{item.name}</span>
                        </div>
                      ) : (
                        item.name
                      )}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {currentPurchases.length === 0 ? (
                <tr>
                  <td
                    colSpan={tableColumns.length}
                    className="p-4 text-center text-gray-500"
                  >
                    No purchases found.
                  </td>
                </tr>
              ) : (
                currentPurchases.map((purchase, index) => (
                  <tr
                    key={purchase._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % purchasesPerPage === 0 ||
                      index + 1 === currentPurchases.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    {allFields
                      .filter((item) => tableColumns.includes(item.id))
                      .map((item) => (
                        <td
                          key={item.id}
                          className="p-3 whitespace-nowrap min-w-[120px]"
                        >
                          {item.id === "invoiceNumber" ? (
                            <div className="flex items-center gap-4">
                              <input
                                type="checkbox"
                                checked={selected.some(
                                  (s) => s.id === purchase._id
                                )}
                                onChange={() => toggleSelect(purchase)}
                              />
                              <span>{purchase.invoiceNumber || "--"}</span>
                            </div>
                          ) : item.id === "actions" ? (
                            <div className="flex items-center justify-center gap-3 min-w-[150px]">
                              <button className="text-blue-600 hover:text-blue-800 cursor-pointer">
                                <Eye
                                  onClick={() => handleView(purchase)}
                                  size={18}
                                />
                              </button>
                              <button
                                className="text-green-600 hover:text-green-800 cursor-pointer"
                                onClick={() => editPurchase(purchase)}
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                className="text-red-600 hover:text-red-800 cursor-pointer"
                                onClick={() => deletePurchase(purchase)}
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ) : (
                            getFieldValue(purchase, item.dbName)
                          )}
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

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

        {/* Add/Remove Column Modal */}
        {isModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsModalOpen(false)}
              />
              <div
                className="relative bg-white p-6 rounded shadow-lg max-w-4xl w-full z-10 max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-semibold mb-4">
                  {activeTab === "add" ? "Add Columns" : "Remove Columns"}
                </h2>

                <div className="flex w-full gap-2 mb-4">
                  <div className="w-1/2">
                    <button
                      onClick={() => {
                        setActiveTab("add");
                        setSelectedItems([]);
                        setAllSelected(false);
                      }}
                      className={`w-full px-4 py-2 font-medium text-center rounded-lg ${
                        activeTab === "add"
                          ? "bg-green-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      Add Columns ({availableColumns.length})
                    </button>
                  </div>
                  <div className="w-1/2">
                    <button
                      onClick={() => {
                        setActiveTab("remove");
                        setSelectedItems([]);
                        setAllSelected(false);
                      }}
                      className={`w-full px-4 py-2 font-medium text-center rounded-lg ${
                        activeTab === "remove"
                          ? "bg-red-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      Remove Columns ({removableColumns.length})
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {chunkedItems.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {/* Select All option (only when not in required tab) */}
                      {chunkedItems.flat().length > 0 && (
                        <div className="flex gap-4 border-b pb-2 mb-2 sticky top-0 bg-white">
                          <label className="flex items-center gap-2 flex-1 cursor-pointer select-none font-semibold">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => toggleItem("all")}
                            />
                            Select All
                          </label>
                          <div className="flex-1"></div>
                        </div>
                      )}

                      {chunkedItems.map((pair, index) => (
                        <div key={index} className="flex gap-4">
                          {pair.map(({ id, name }) => (
                            <label
                              key={id}
                              className="flex items-center gap-1 flex-1 cursor-pointer select-none hover:bg-gray-50 rounded"
                            >
                              <input
                                type="checkbox"
                                checked={selectedItems.includes(id)}
                                onChange={() => toggleItem(id)}
                              />
                              <span className="flex-1">{name}</span>
                            </label>
                          ))}
                          {pair.length === 1 && <div className="flex-1"></div>}
                        </div>
                      ))}

                      {/* REQUIRED COLUMNS shown on Remove tab */}
                      {activeTab === "remove" && (
                        <div className="mt-6 border-t pt-4">
                          <h3 className="text-sm font-semibold text-gray-600 mb-2">
                            Compulsory Fields
                          </h3>
                          <div className="grid grid-cols-2 gap-3 text-gray-400 text-sm">
                            {allFields
                              .filter((field) =>
                                requiredColumns.includes(field.id)
                              )
                              .map((field) => (
                                <div
                                  key={field.id}
                                  className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1 cursor-not-allowed"
                                >
                                  <input type="checkbox" checked disabled />
                                  <div className="flex flex-col">
                                    <span>{field.name}</span>
                                    <span className="text-xs text-red-500">
                                      This field is compulsory
                                    </span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {activeTab === "add"
                        ? "All available columns are already in the table."
                        : "No columns available to remove."}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 cursor-pointer"
                  >
                    Reset to Default
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelEvent}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={selectedItems.length === 0}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Import Modal */}
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
                      Supplier Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.supplierName || "--"}
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

                  {/* Supplier Name - Text field */}
                  <div>
                    <label className="block text-sm font-medium">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      name="supplierName"
                      value={form.supplierName || ""}
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
                    <label className="block text-sm font-medium">
                      FOB (USD)
                    </label>
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
                    <label className="block text-sm font-medium">
                      CIF (USD)
                    </label>
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
                    <label className="block text-sm font-medium">
                      LC Number
                    </label>
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
                      value={
                        form.amount
                          ? parseFloat(form.amount).toFixed(2)
                          : "0.00"
                      }
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
    </div>
  );
}

export default Purchase;
