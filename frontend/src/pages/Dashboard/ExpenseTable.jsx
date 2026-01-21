// ExpenseTable.jsx
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

  // Calculate pagination values
  const totalRows = expenseTableData?.length || 0;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  
  // Reset to page 1 when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeExpenseSubTab, expenseTableData]);

  // Get data for current page
  const paginatedData = useMemo(() => {
    if (!expenseTableData || expenseTableData.length === 0) {
      return [];
    }
    
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return expenseTableData.slice(startIndex, endIndex);
  }, [expenseTableData, currentPage]);

  // Handle page change
  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      // Show all pages if total pages is less than or equal to maxVisiblePages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show limited pages with ellipsis
      if (currentPage <= 3) {
        // Show first 4 pages and last page
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Show first page and last 4 pages
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // Show pages around current page
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  // Calculate expense statistics
  const expenseStats = useMemo(() => {
    if (!expenseTableData || expenseTableData.length === 0) {
      return {
        totalAmount: 0,
        count: 0,
        averageExpense: 0,
        pendingCount: 0,
        totalPendingAmount: 0,
      };
    }

    let totalAmount = 0;
    let pendingCount = 0;
    let totalPendingAmount = 0;

    expenseTableData.forEach((item) => {
      const amount = parseFloat(item.amount) || 0;
      totalAmount += amount;
      
      if (item.status === 'Pending' || item.status === 'Unpaid') {
        pendingCount++;
        totalPendingAmount += amount;
      }
    });

    return {
      totalAmount,
      count: expenseTableData.length,
      averageExpense: expenseTableData.length > 0 ? totalAmount / expenseTableData.length : 0,
      pendingCount,
      totalPendingAmount,
    };
  }, [expenseTableData]);

  const toggleDescription = (index) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const openDescriptionModal = (description) => {
    setCurrentDescription(description);
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

  const countWords = (text) => {
    if (!text) return 0;
    return text.trim().split(/\s+/).length;
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const columns = [
    {
      header: "Category",
      accessor: "category",
      render: (item) => (
        <div className="font-medium text-gray-900 capitalize">
          {item.category || "Uncategorized"}
        </div>
      ),
    },
    {
      header: "Amount ($)",
      render: (item) => {
        const amount = parseFloat(item.amount) || 0;
        const isPending = item.status === 'Pending' || item.status === 'Unpaid';
        
        return (
          <div className="flex flex-col">
            <span className={`font-bold ${isPending ? 'text-orange-600' : 'text-red-600'}`}>
              ${formatCurrency(amount)}
            </span>
            {item.status && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                item.status === 'Approved' ? 'bg-green-100 text-green-800' :
                item.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                item.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
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
          {item.dueDate && item.status === 'Pending' && (
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
        const description = item.description || '';
        const isExpanded = expandedDescriptions[rowIndex];
        const wordCount = countWords(description);
        const shouldTruncate = description.length > 100 || wordCount > 15;

        if (!shouldTruncate) {
          return (
            <span className="text-gray-700">
              {description || "No description"}
            </span>
          );
        }

        // For very long descriptions (200+ words), show modal
        if (wordCount > 100) {
          return (
            <div className="flex items-center gap-2">
              <span className="text-gray-700 text-sm">
                {description.substring(0, 100)}...
              </span>
              <button
                onClick={() => openDescriptionModal(description)}
                className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 border border-blue-300 rounded hover:bg-blue-50 transition-colors"
              >
                View Full
              </button>
            </div>
          );
        }

        // For moderately long descriptions (15-100 words), use expand/collapse
        return (
          <div className="flex items-center gap-2">
            <span className="text-gray-700 text-sm">
              {isExpanded ? description : `${description.substring(0, 100)}...`}
            </span>
            <button
              onClick={() => toggleDescription(rowIndex)}
              className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 border border-blue-300 rounded hover:bg-blue-50 transition-colors"
            >
              {isExpanded ? 'Show Less' : 'Show More'}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Expense Summary Statistics */}
      {!loadingExpenseData && expenseStats.count > 0 && (
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">
                {expenseStats.count}
              </div>
              <div className="text-sm text-gray-600">Total Expenses</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                ${formatCurrency(expenseStats.totalAmount)}
              </div>
              <div className="text-sm text-gray-600">Total Amount</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                ${formatCurrency(expenseStats.averageExpense)}
              </div>
              <div className="text-sm text-gray-600">Average Expense</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {expenseStats.pendingCount}
              </div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                ${formatCurrency(expenseStats.totalPendingAmount)}
              </div>
              <div className="text-sm text-gray-600">Pending Amount</div>
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      <DataTable
        title={getTableTitle()}
        loading={loadingExpenseData}
        loadingText="Loading expense data..."
        emptyText={`No expense data found for ${activeExpenseSubTab}`}
        columns={columns}
        data={paginatedData}
      />

      {/* Pagination Controls - Only show if we have data and more than one page */}
      {totalRows > 0 && totalPages > 1 && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
            {/* Showing results info */}
            <div className="text-sm text-gray-700">
              <span className="font-medium">Page {currentPage} of {totalPages}</span>
              <span className="mx-2">•</span>
              <span>
                Showing <span className="font-medium">{(currentPage - 1) * rowsPerPage + 1}</span> to{" "}
                <span className="font-medium">
                  {Math.min(currentPage * rowsPerPage, totalRows)}
                </span>{" "}
                of <span className="font-medium">{totalRows}</span> expenses
              </span>
            </div>
            
            {/* Page Navigation */}
            <div className="flex items-center space-x-2">
              {/* Previous Page Button */}
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`inline-flex items-center justify-center p-2 rounded-md ${
                  currentPage === 1
                    ? "text-gray-400 cursor-not-allowed bg-gray-100"
                    : "text-gray-700 hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"
                }`}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              {/* Page Numbers */}
              {getPageNumbers().map((page, index) => (
                <button
                  key={index}
                  onClick={() => typeof page === 'number' ? handlePageChange(page) : null}
                  className={`min-w-[36px] h-9 px-3 rounded-md text-sm font-medium ${
                    page === currentPage
                      ? "bg-blue-600 text-white"
                      : typeof page === 'number'
                      ? "text-gray-700 hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"
                      : "text-gray-500 cursor-default"
                  }`}
                  disabled={typeof page !== 'number'}
                  aria-label={typeof page === 'number' ? `Page ${page}` : 'More pages'}
                  aria-current={page === currentPage ? 'page' : undefined}
                >
                  {page}
                </button>
              ))}

              {/* Next Page Button */}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`inline-flex items-center justify-center p-2 rounded-md ${
                  currentPage === totalPages
                    ? "text-gray-400 cursor-not-allowed bg-gray-100"
                    : "text-gray-700 hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"
                }`}
                aria-label="Next page"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show simple info if only one page */}
      {totalRows > 0 && totalPages === 1 && (
        <div className="text-sm text-gray-500 text-center py-2 bg-white border border-gray-200 rounded-lg px-4">
          Showing all {totalRows} expenses (Page 1 of 1)
        </div>
      )}

      {/* Description Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-800">
                  Expense Description
                </h3>
                <button
                  onClick={closeDescriptionModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                {currentDescription || "No description available"}
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <div className="flex justify-end">
                <button
                  onClick={closeDescriptionModal}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};