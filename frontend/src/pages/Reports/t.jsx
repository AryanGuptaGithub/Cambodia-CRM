import React, { useState, useEffect, useRef } from "react";
import {
  PieChart,
  Download,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Detail Modal (unchanged - good as is)
const DetailModal = ({ isOpen, onClose, title, records }) => {
  if (!isOpen) return null;

  const total = records.reduce((sum, r) => sum + (r.amount || 0), 0);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 flex justify-center items-center z-50">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-indigo-50">
          <div>
            <h2 className="text-lg font-bold text-indigo-800">{title} — Records</h2>
            <p className="text-xs text-indigo-500 mt-0.5">
              {records.length} record{records.length !== 1 ? "s" : ""} found
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh]">
          {records.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No records found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Description / Remarks</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Amount ($)</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec, idx) => (
                  <tr key={rec._id || idx} className={`border-b last:border-0 hover:bg-gray-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                    <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {rec.date ? new Date(rec.date).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[220px] truncate">
                      {rec.description || rec.remarks || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">
                      ${(rec.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-indigo-50 sticky bottom-0">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-bold text-indigo-800 text-right">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-indigo-800">
                    ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// Main Component
const TotalExpense = () => {
  const [data, setData] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [summary, setSummary] = useState({
    totalExchangeLoss: 0,
    totalRemittance: 0,
    totalExpense: 0,
    totalSalary: 0,
    totalOtherExpense: 0,
    totalTransactions: 0,
  });

  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("all");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({ startDate: null, endDate: null });
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });

  const [exportLoading, setExportLoading] = useState(false);
  const [itemsPerPage] = useState(10);   // You can change this

  const [detailModal, setDetailModal] = useState({ isOpen: false, title: "", records: [] });

  const inputRef = useRef(null);
  const visiblePages = useVisiblePages(pagination.currentPage, pagination.totalPages);

  // ROWS Definition
  const ROWS = [
    { type: "exchange_loss", label: "Bank Charges", amount: summary.totalExchangeLoss, color: "bg-red-500" },
    { type: "remittance", label: "Remittance", amount: summary.totalRemittance, color: "bg-green-500" },
    { type: "expense", label: "Expense", amount: summary.totalExpense, color: "bg-purple-500" },
    { type: "salary", label: "Salary", amount: summary.totalSalary, color: "bg-orange-500" },
    { type: "other_expense", label: "Other Expenses", amount: summary.totalOtherExpense, color: "bg-pink-500" },
  ];

  // Derived summaryData (only items with amount > 0)
  const summaryData = ROWS.filter((r) => r.amount > 0);

  // Pagination Logic - Corrected
  useEffect(() => {
    const totalRecords = summaryData.length;

    setPagination({
      currentPage: 1,
      totalPages: Math.ceil(totalRecords / 7),   // Show pagination if > 7
      totalRecords: totalRecords,
      hasNext: totalRecords > 7,
      hasPrev: false,
    });
  }, [summaryData]);

  // Rest of your fetch functions, date handlers, etc. remain the same...
  // (I kept them unchanged for brevity - they are already good)

  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-start gap-2 mt-6">
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            pagination.hasPrev ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          <ChevronLeft size={16} /> Prev
        </button>

        <div className="flex gap-1">
          {visiblePages.map((page, index) => (
            <button
              key={index}
              onClick={() => typeof page === "number" && handlePageChange(page)}
              className={`min-w-[40px] px-3 py-2 rounded-lg cursor-pointer ${
                page === pagination.currentPage
                  ? "bg-indigo-600 text-white"
                  : typeof page === "number"
                  ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  : "bg-transparent text-gray-500 cursor-default"
              }`}
              disabled={typeof page !== "number"}
            >
              {page}
            </button>
          ))}
        </div>

        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={!pagination.hasNext}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            pagination.hasNext ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    );
  };

  // In your table body, use summaryData directly (since it's already filtered)
  // And show pagination only when needed

  return (
    <div className="p-6">
      {/* ... your header, tabs, grand total, breakdown ... */}

      {/* Main Summary Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">Sr. No.</th>
              <th className="p-3 text-sm font-medium">Type</th>
              <th className="p-3 text-sm font-medium">Amount ($)</th>
              <th className="p-3 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="p-6 text-center text-gray-400">Loading...</td>
              </tr>
            ) : summaryData.length > 0 ? (
              summaryData.map((item, index) => (
                <tr key={item.type} className="hover:bg-gray-50 border-b last:border-0">
                  <td className="p-3 text-sm text-gray-600 font-medium">{index + 1}</td>
                  <td className="p-3 text-sm font-medium text-gray-900 capitalize">{item.label}</td>
                  <td className="p-3 text-sm font-semibold text-red-600">
                    ${(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => openDetail(item.type, item.label)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                    >
                      <Eye size={14} /> View All
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="p-6 text-center text-gray-500">No financial data found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination - Only show if more than 7 records */}
      {renderPagination()}

      {/* Rest of your modals */}
      <DetailModal
        isOpen={detailModal.isOpen}
        onClose={closeDetail}
        title={detailModal.title}
        records={detailModal.records}
      />

      {/* Custom Filter Modal - unchanged */}
      {/* ... your custom filter portal ... */}
    </div>
  );
};

export default TotalExpense;