import React, { useState, useMemo, useEffect } from "react";
import { formatDateToReadable } from "../../utils/dateUtil";
import { DataTable } from "./DataTable";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export const ExpenseTable = ({
  expenseTableData,
  loadingExpenseData,
  activeExpenseSubTab,
  dateRanges,
  onViewExpenseDetails,
}) => {
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [currentDescription, setCurrentDescription] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  const totalRows = expenseTableData?.length || 0;
  const totalPages = Math.ceil(totalRows / rowsPerPage);

  useEffect(() => setCurrentPage(1), [activeExpenseSubTab, expenseTableData]);

  const paginatedData = useMemo(() => {
    if (!expenseTableData) return [];
    const start = (currentPage - 1) * rowsPerPage;
    return expenseTableData.slice(start, start + rowsPerPage);
  }, [expenseTableData, currentPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const getPageNumbers = () => {
    const pages = [];
    const max = 5;
    if (totalPages <= max) for (let i = 1; i <= totalPages; i++) pages.push(i);
    else if (currentPage <= 3) {
      for (let i = 1; i <= 4; i++) pages.push(i);
      pages.push("...");
      pages.push(totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1);
      pages.push("...");
      for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push("...");
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
      pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const expenseStats = useMemo(() => {
    if (!expenseTableData?.length)
      return {
        totalAmount: 0,
        count: 0,
        averageExpense: 0,
        pendingCount: 0,
        totalPendingAmount: 0,
      };
    let totalAmount = 0,
      pendingCount = 0,
      totalPendingAmount = 0;
    expenseTableData.forEach((item) => {
      const amt = parseFloat(item.amount) || 0;
      totalAmount += amt;
      if (item.status === "Pending" || item.status === "Unpaid") {
        pendingCount++;
        totalPendingAmount += amt;
      }
    });
    return {
      totalAmount,
      count: expenseTableData.length,
      averageExpense: totalAmount / expenseTableData.length,
      pendingCount,
      totalPendingAmount,
    };
  }, [expenseTableData]);

  const toggleDescription = (index) =>
    setExpandedDescriptions((prev) => ({ ...prev, [index]: !prev[index] }));
  const openDescriptionModal = (desc) => {
    setCurrentDescription(desc);
    setModalOpen(true);
  };
  const closeDescriptionModal = () => {
    setModalOpen(false);
    setCurrentDescription("");
  };

  const getDateRangeLabel = () => {
    const range = dateRanges[activeExpenseSubTab?.toLowerCase()];
    return range ? `(${range.start} to ${range.end})` : "";
  };
  const getTableTitle = () => {
    const dateRange = getDateRangeLabel();
    switch (activeExpenseSubTab) {
      case "Month":
        return `Monthly Expenses`;
      case "Year":
        return `Yearly Expenses`;
      case "Pending":
        return "Pending Expenses";
      case "Approved":
        return "Approved Expenses";
      case "Rejected":
        return "Rejected Expenses";
      case "Overdue":
        return "Overdue Expenses";
      case "Unreceive_Payment":
        return "Unpaid Expenses";
      default:
        return `Expenses ${dateRange}`;
    }
  };

  const countWords = (text) => (text ? text.trim().split(/\s+/).length : 0);
  const formatCurrency = (amount) =>
    parseFloat(amount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const columns = [
    {
      header: "Category",
      render: (item) => (
        <div className="font-medium text-gray-900 capitalize">
          {item.category || "Uncategorized"}
        </div>
      ),
    },
    {
      header: "Amount ($)",
      render: (item) => {
        const amt = parseFloat(item.amount) || 0;
        const isPending = item.status === "Pending" || item.status === "Unpaid";
        return (
          <div className="flex flex-col">
            <span
              className={`font-bold ${isPending ? "text-orange-600" : "text-red-600"}`}
            >
              ${formatCurrency(amt)}
            </span>
            {item.status && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${item.status === "Approved" ? "bg-green-100 text-green-800" : item.status === "Pending" ? "bg-yellow-100 text-yellow-800" : item.status === "Rejected" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`}
              >
                {item.status}
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: "Date",
      render: (item) => (
        <div className="text-gray-700">
          {formatDateToReadable(item.date)}
          {item.dueDate && item.status === "Pending" && (
            <div className="text-xs text-gray-500">
              Due: {formatDateToReadable(item.dueDate)}
            </div>
          )}
        </div>
      ),
    },
    {
      header: "Description",
      render: (item, rowIndex) => {
        const desc = item.remarks || "";
        const isExpanded = expandedDescriptions[rowIndex];
        const wordCount = countWords(desc);
        const shouldTruncate = desc.length > 100 || wordCount > 15;
        if (!shouldTruncate)
          return (
            <span className="text-gray-700">{desc || "No description"}</span>
          );
        if (wordCount > 100)
          return (
            <div className="flex items-center gap-2">
              <span className="text-gray-700 text-sm">
                {desc.substring(0, 100)}...
              </span>
              <button
                onClick={() => openDescriptionModal(desc)}
                className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 border border-blue-300 rounded hover:bg-blue-50"
              >
                View Full
              </button>
            </div>
          );
        return (
          <div className="flex items-center gap-2">
            <span className="text-gray-700 text-sm">
              {isExpanded ? desc : `${desc.substring(0, 100)}...`}
            </span>
            <button
              onClick={() => toggleDescription(rowIndex)}
              className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 border border-blue-300 rounded hover:bg-blue-50"
            >
              {isExpanded ? "Show Less" : "Show More"}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {!loadingExpenseData && expenseStats.count > 0 && (
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-gray-800">
                {expenseStats.count}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">
                Total Expenses
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-red-600">
                ${formatCurrency(expenseStats.totalAmount)}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">
                Total Amount
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-blue-600">
                ${formatCurrency(expenseStats.averageExpense)}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">
                Average Expense
              </div>
            </div>
          </div>
        </div>
      )}

      <DataTable
        title={getTableTitle()}
        loading={loadingExpenseData}
        loadingText="Loading expense data..."
        emptyText={`No expense data found for ${activeExpenseSubTab}`}
        columns={columns}
        data={paginatedData}
      />

      {totalRows > 0 && totalPages > 1 && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs sm:text-sm text-gray-700">
              <span className="font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <span className="mx-2">•</span>
              <span>
                Showing{" "}
                <span className="font-medium">
                  {(currentPage - 1) * rowsPerPage + 1}
                </span>{" "}
                to{" "}
                <span className="font-medium">
                  {Math.min(currentPage * rowsPerPage, totalRows)}
                </span>{" "}
                of <span className="font-medium">{totalRows}</span> expenses
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 sm:p-2 rounded-md border border-gray-300 bg-white disabled:opacity-40"
              >
                <ChevronLeft size={16} className="sm:w-5 sm:h-5" />
              </button>
              {getPageNumbers().map((p, i) => (
                <button
                  key={i}
                  onClick={() => typeof p === "number" && handlePageChange(p)}
                  disabled={typeof p !== "number"}
                  className={`min-w-[32px] sm:min-w-[36px] h-8 sm:h-9 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium ${p === currentPage ? "bg-blue-600 text-white" : typeof p === "number" ? "bg-white border border-gray-300 hover:bg-gray-100" : "text-gray-500 cursor-default"}`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 sm:p-2 rounded-md border border-gray-300 bg-white disabled:opacity-40"
              >
                <ChevronRight size={16} className="sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {totalRows > 0 && totalPages === 1 && (
        <div className="text-sm text-gray-500 text-center py-2 bg-white border border-gray-200 rounded-lg px-4">
          Showing all {totalRows} expenses
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold">Expense Description</h3>
                <button
                  onClick={closeDescriptionModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                {currentDescription || "No description available"}
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={closeDescriptionModal}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
