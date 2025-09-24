import React, { useState, useEffect, useMemo } from "react";
import { Search, UserPlus, Upload, X } from "lucide-react";
import SampleExcelDownloadPaymentReports from "../../excels/SampleExcelDownloadPaymentReports";
import ReactDOM from "react-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { getVisiblePages } from "../../utils/useVisiblePages";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";
const paymentReportRowPerPage = 9;

const PaymentReports = () => {
  const [activeTab, setActiveTab] = useState("Income");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [selected, setSelected] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [paymentReportData, setPaymentReportData] = useState([]);
  const [loading, setLoading] = useState(true);

  const filteredData = paymentReportData.filter(
    (item) =>
      item.paymentType === activeTab &&
      item.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 1. Fetch data on mount
  const fetchPaymentReports = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/payments-reports`);
      if (!res.ok) throw new Error("Failed to fetch payment reports");

      const data = await res.json();
      setPaymentReportData(data);
    } catch (error) {
      console.error("❌ Fetch Payment Reports Error:", error);
      showToast("error", error.message || "Error fetching payment reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentReports();
  }, []);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * paymentReportRowPerPage;
    const endIndex = startIndex + paymentReportRowPerPage;
    return paymentReportData.slice(startIndex, endIndex);
  }, [paymentReportData, currentPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(paymentReportData.length / paymentReportRowPerPage);
  }, [paymentReportData, paymentReportRowPerPage]);

  const filteredPaymentReport = paymentReportData;

  const visiblePages = useMemo(() => {
    return getVisiblePages(currentPage, totalPages);
  }, [currentPage, totalPages]);

  const totalAmount = useMemo(() => {
    return filteredPaymentReport.reduce(
      (sum, item) => sum + (item.totalAmount || 0),
      0
    );
  }, [filteredPaymentReport]);

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
        "recording date",
        "invoice #",
        "invoice date",
        "delivery date",
        "customer code",
        "number of product",
        "total qty",
        "total amount (usd)",
        "remaining amount (usd)",
        "cash collection (usd)",
      ];

      let headerRowIndex = -1;
      let matchedHeaders = [];

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
            recordingDate: parseExcelDate(item["recording date"]),
            invoiceNumber: item["invoice #"],
            invoiceDate: parseExcelDate(item["invoice date"]),
            deliveryDate: parseExcelDate(item["delivery date"]),
            staffName: item["staff name"],
            customerCode: item["customer code"],
            numberOfProduct: parseInt(item["number of product"]),
            totalQty: parseInt(item["total qty"]),
            totalAmount: parseFloat(item["total amount (usd)"]),
            collected: parseFloat(item["collected (usd)"]),
            remainingAmount: parseFloat(item["remaining amount (usd)"]),
            cashCollection: parseFloat(item["cash collection (usd)"]),
            balance: parseFloat(item["balance (usd)"]),
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
        `${backendUrl}/api/payments-reports/import`,
        parsedData
      );

      // If import is successful
      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Payment Reports imported successfully!"
        );
        setShowImportModal(false);
        fetchPaymentReports();
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

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/reportlayout/payment/new")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <UserPlus size={18} /> Add New Reports
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
      </div>
      <div className="flex flex-wrap justify-between items-center mb-4">
        {/* Tabs */}
        <div className="flex gap-4 mb-4">
          {["Income", "Expense"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-lg capitalize ${
                activeTab === tab
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex justify-between items-center mb-4 gap-8">
          <p className="text-lg font-semibold text-gray-700">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
              {paymentReportData.length}
            </span>
          </p>

          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border px-4 py-2 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
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
                Import Payment Reports
              </h2>
              {isSampleFile && <SampleExcelDownloadPaymentReports />}
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-xl overflow-hidden text-center">
          <thead className="bg-gray-100 text-gray-700 text-sm">
            <tr>
              <th className="p-3">Payment Date</th>
              <th className="p-3">Reference Number</th>
              <th className="p-3">Payment Type</th>
              <th className="p-3">User</th>
              <th className="p-3">Mode Type</th>
              <th className="p-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((item) => (
                <tr
                  key={item._id}
                  className="border-b hover:bg-gray-50 text-sm"
                >
                  <td className="p-3">{formatDateToReadable(item.recordingDate)}</td>
                  <td className="p-3">{item.referenceNumber}</td>
                  <td className="p-3">{item.paymentType}</td>
                  <td className="p-3">{item.customerName}</td>
                  <td className="p-3">{item.paymentMode}</td>
                  <td
                    className={`p-3 font-medium ${
                      item.paymentType === "Expense"
                        ? "text-red-600"
                        : "text-green-700"
                    }`}
                  >
                    {item.paymentType === "Expense" ? "-" : ""}
                    {item.totalAmount?.toFixed(2) ?? "0.00"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="py-4 text-gray-500">
                  No data found
                </td>
              </tr>
            )}
          </tbody>

          {/* Footer Total */}
          <tfoot>
            <tr className="bg-gray-100 font-semibold text-sm">
              <td colSpan="5" className="text-right p-3">
                Total:
              </td>
              <td
                className={`p-3 ${
                  totalAmount >= 0 ? "text-green-700" : "text-red-600"
                }`}
              >
                {totalAmount.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination */}
   

      {filteredPaymentReport.length > 0 && (
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
    </div>
  );
};

export default PaymentReports;
