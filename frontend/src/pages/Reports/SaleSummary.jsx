import React, { useState, useRef } from "react";
import { Search, UserPlus, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SampleExcelDownloadDailySummaryReport from "../../excels/SampleExcelDownloadDailySummary";
import ReactDOM from "react-dom";

const saleData = [
  {
    id: 1,
    orderDate: "2025-08-20",
    invoiceNumber: "INV001",
    clientName: "Acme Corp",
    amount: 1200,
    paymentStatus: "Paid",
    createdBy: "John Doe",
  },
  {
    id: 2,
    orderDate: "2025-08-21",
    invoiceNumber: "INV002",
    clientName: "Beta Ltd",
    amount: 850,
    paymentStatus: "Unpaid",
    createdBy: "Jane Smith",
  },
  {
    id: 3,
    orderDate: "2025-08-22",
    invoiceNumber: "INV003",
    clientName: "Gamma Inc",
    amount: 1500,
    paymentStatus: "Paid",
    createdBy: "Tom White",
  },
  {
    id: 4,
    orderDate: "2025-08-23",
    invoiceNumber: "INV004",
    clientName: "Delta LLC",
    amount: 970,
    paymentStatus: "Unpaid",
    createdBy: "Alice Brown",
  },
  {
    id: 5,
    orderDate: "2025-08-24",
    invoiceNumber: "INV005",
    clientName: "Omega Pvt Ltd",
    amount: 1900,
    paymentStatus: "Paid",
    createdBy: "Sarah King",
  },
  {
    id: 6,
    orderDate: "2025-08-25",
    invoiceNumber: "INV006",
    clientName: "Zeta Corp",
    amount: 1300,
    paymentStatus: "Unpaid",
    createdBy: "Clark Kent",
  },
  {
    id: 7,
    orderDate: "2025-08-26",
    invoiceNumber: "INV007",
    clientName: "Theta Enterprises",
    amount: 2100,
    paymentStatus: "Paid",
    createdBy: "Diana Prince",
  },
  {
    id: 8,
    orderDate: "2025-08-27",
    invoiceNumber: "INV008",
    clientName: "Lambda Group",
    amount: 750,
    paymentStatus: "Paid",
    createdBy: "Bruce Wayne",
  },
  {
    id: 9,
    orderDate: "2025-08-28",
    invoiceNumber: "INV009",
    clientName: "Sigma Holdings",
    amount: 1000,
    paymentStatus: "Unpaid",
    createdBy: "Peter Parker",
  },
  {
    id: 10,
    orderDate: "2025-08-29",
    invoiceNumber: "INV010",
    clientName: "Epsilon Ltd",
    amount: 1150,
    paymentStatus: "Paid",
    createdBy: "Tony Stark",
  },
  {
    id: 11,
    orderDate: "2025-08-30",
    invoiceNumber: "INV011",
    clientName: "Omega Traders",
    amount: 980,
    paymentStatus: "Unpaid",
    createdBy: "Steve Rogers",
  },
];

const ITEMS_PER_PAGE = 10;

const SaleSummary = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

  const filteredData = saleData.filter(
    (item) =>
      item.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.clientName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

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

      // ✅ Expected headers
      const requiredHeaders = [
        "customer code",
        "date",
        "medical representative name",
        "customer name in english",
        "types of business",
        "customer number",
        "customer address",
        "zone",
        "location",
        "remark",
      ];

      let headerRowIndex = -1;
      let matchedHeaders = [];

      // ✅ Find header row (first 10 rows max)
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map((cell) =>
          cell?.toString().trim().toLowerCase()
        );
        const matched = requiredHeaders.filter((header) =>
          row.includes(header)
        );
        if (matched.length >= 5) {
          headerRowIndex = i;
          matchedHeaders = matched;
          break;
        }
      }

      // ❌ If required headers not found
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

      // ✅ Map header keys to column indexes
      const rawHeaders = rows[headerRowIndex];
      const headersMap = {};
      rawHeaders.forEach((header, index) => {
        if (!header) return;
        const cleaned = header.toString().trim().toLowerCase();
        headersMap[index] = cleaned;
      });
      // ✅ Parse data rows
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
            customerCode: item["customer code"],
            date: parseExcelDate(item["date"]),
            medicalRepName: item["medical representative name"],
            name: item["customer name in english"],
            typeOfBusiness: item["types of business"],
            customerNumber: item["customer number"],
            address: item["customer address"],
            zone: item["zone"],
            location: item["location"],
            remark: item["remark"],
          };
        })
        .filter((entry, index) => {
          const keep = !!entry.customerCode;
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
      return jsDate.toISOString(); // Or keep as Date object
    }

    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  // Import parsed customers to backend
  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }
    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/customers/import`,
        parsedData
      );

      // If import is successful
      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Customers imported successfully!"
        );
        setShowImportModal(false);
        const response = await fetch(`${backendUrl}/api/customers`);
        const data = await response.json();
        setCustomers(data.customers);
        setNextCustomerCode(data.nextCustomerCode);
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
              {filteredData.length}
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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-xl overflow-hidden">
          <thead className="bg-gray-100 text-gray-700 text-sm">
            <tr>
              <th className="p-3 text-left">Order Date</th>
              <th className="p-3 text-left">Invoice Number</th>
              <th className="p-3 text-left">Client Name</th>
              <th className="p-3 text-left">Amount</th>
              <th className="p-3 text-left">Payment Status</th>
              <th className="p-3 text-left">Created By</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((item) => (
                <tr key={item.id} className="border-b hover:bg-gray-50 text-sm">
                  <td className="p-3">{item.orderDate}</td>
                  <td className="p-3">{item.invoiceNumber}</td>
                  <td className="p-3">{item.clientName}</td>
                  <td className="p-3 font-medium">₹{item.amount.toFixed(2)}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 text-xs rounded-full font-semibold ${
                        item.paymentStatus === "Paid"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {item.paymentStatus}
                    </span>
                  </td>
                  <td className="p-3">{item.createdBy}</td>
                </tr>
              ))
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
