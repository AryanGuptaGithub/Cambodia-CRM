// ExpenseTable.jsx
import React, { useState } from "react";
import { formatDateToReadable } from "../../utils/dateUtil";
import { DataTable } from "./DataTable";

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
    const range = dateRanges[activeExpenseSubTab.toLowerCase()];
    return range ? `(${range.start} to ${range.end})` : "";
  };

  const countWords = (text) => {
    if (!text) return 0;
    return text.trim().split(/\s+/).length;
  };

  const columns = [
    {
      header: "Category",
      accessor: "category",
    },
    {
      header: "Amount ($)",
      render: (item) => `${item.amount}`,
      className: "text-red-500",
    },
    {
      header: "Date",
      render: (item) => formatDateToReadable(item.date),
    },
    {
      header: "Description",
      render: (item, rowIndex) => {
        const description = item.description || '';
        const isExpanded = expandedDescriptions[rowIndex];
        const wordCount = countWords(description);
        const shouldTruncate = description.length > 100 || wordCount > 15;

        if (!shouldTruncate) {
          return description;
        }

        // For very long descriptions (200+ words), show modal
        if (wordCount > 100) {
          return (
            <div className="flex items-center gap-2">
              <span className="text-sm">
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
            <span className="text-sm">
              {isExpanded ? description : `${description.substring(0, 100)}...`}
            </span>
            <button
              onClick={() => toggleDescription(rowIndex)}
              className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 border border-blue-300 rounded hover:bg-blue-50 transition-colors"
            >
              {isExpanded ? 'Hide' : 'View'}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        title={`Expenses`}
        loading={loadingExpenseData}
        loadingText="Loading expense data..."
        emptyText="No expense data available"
        columns={columns}
        data={expenseTableData}
      />

      {/* Description Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-800">
                  Full Description
                </h3>
                <button
                  onClick={closeDescriptionModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="text-gray-700 whitespace-pre-wrap">
                {currentDescription}
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
    </>
  );
};