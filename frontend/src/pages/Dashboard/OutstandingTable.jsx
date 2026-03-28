import React, { useState, useMemo, useEffect } from "react";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "./DashboardUtil";
import { DataTable } from "./DataTable";

export const OutstandingTable = ({
  outstandingTableData,
  loadingOutstandingData,
  activeOutstandingSubTab,
  dateRanges,
  onViewInvoices,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  // Group outstanding data by MR
  const groupedOutstandingData = useMemo(() => {
    const mrGroups = {};
    outstandingTableData.forEach((outstanding) => {
      const mrName = outstanding.mrName || "Unknown MR";

      if (!mrGroups[mrName]) {
        mrGroups[mrName] = {
          mrName: mrName,
          totalOutstanding: 0,
          invoices: [],
          customerCount: 0,
          customers: new Set(),
          invoiceCount: 0,
        };
      }

      const dueAmount = parseFloat(outstanding.dueAmount) || 0;
      mrGroups[mrName].totalOutstanding += dueAmount;
      mrGroups[mrName].invoices.push(outstanding);
      mrGroups[mrName].invoiceCount += 1;

      if (outstanding.customerName && outstanding.customerName.trim() !== "") {
        mrGroups[mrName].customers.add(outstanding.customerName);
      }
    });

    Object.values(mrGroups).forEach((mr) => {
      mr.customerCount = mr.customers.size;
    });

    return Object.values(mrGroups).sort(
      (a, b) => b.totalOutstanding - a.totalOutstanding,
    );
  }, [outstandingTableData]);

  const totalRows = groupedOutstandingData.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeOutstandingSubTab]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return groupedOutstandingData.slice(startIndex, startIndex + rowsPerPage);
  }, [groupedOutstandingData, currentPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
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

  const getTableTitle = () => {
    if (!dateRanges)
      return `Outstanding Details - ${activeOutstandingSubTab || "Outstanding"}`;
    switch (activeOutstandingSubTab) {
      case "Today":
        return `Outstanding Details - ${dateRanges.today?.label || "Today"}`;
      case "Month":
        return `Outstanding Details - ${dateRanges.month?.label || "This Month"}`;
      case "Year":
        return `Outstanding Details - ${dateRanges.year?.rangeLabel || "This Year"}`;
      case "30+ Days":
        return "Outstanding - 30+ Days Overdue";
      case "60+ Days":
        return "Outstanding - 60+ Days Overdue";
      case "90+ Days":
        return "Outstanding - 90+ Days Overdue";
      case "Overdue":
        return "Overdue Outstanding Details";
      case "Unreceive_Payment":
        return "Unreceived Payment Details";
      default:
        return `Outstanding Details - ${activeOutstandingSubTab || "Outstanding"}`;
    }
  };

  return (
    <div className="space-y-4">
      <DataTable
        title={getTableTitle()}
        loading={loadingOutstandingData}
        loadingText="Loading outstanding data..."
        emptyText={`No outstanding data found for ${activeOutstandingSubTab}`}
        columns={[
          {
            header: "MR Name",
            accessor: "mrName",
            className: "capitalize font-medium text-gray-900",
          },
          {
            header: "Customers",
            render: (row) =>
              row.customerCount === 1 ? (
                <span className="text-gray-900">
                  {Array.from(row.customers)[0] || "N/A"}
                </span>
              ) : (
                <span className="text-purple-600 font-medium">
                  {row.customerCount} customers
                </span>
              ),
          },
          {
            header: "Invoices",
            render: (row) =>
              row.invoiceCount === 1 ? (
                <span className="text-gray-900">
                  {row.invoices[0]?.invoiceNumber || "N/A"}
                </span>
              ) : (
                <span className="text-blue-600 font-medium">
                  {row.invoiceCount} invoices
                </span>
              ),
          },
          {
            header: "Total Outstanding ($)",
            render: (row) => (
              <div className="flex flex-col">
                <span className="text-orange-600 font-semibold text-base">
                  ${formatCurrency(row.totalOutstanding)}
                </span>
                {row.invoiceCount > 1 && (
                  <span className="text-xs text-gray-500">
                    Avg: $
                    {formatCurrency(row.totalOutstanding / row.invoiceCount)}
                  </span>
                )}
              </div>
            ),
          },
          {
            header: "Actions",
            render: (row) => (
              <button
                onClick={() => onViewInvoices(row.mrName, row.invoices)}
                className="inline-flex items-center justify-center px-2 py-1 sm:px-3 sm:py-2 border border-transparent text-xs sm:text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors duration-200"
              >
                <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                View
              </button>
            ),
            className: "text-center",
          },
        ]}
        data={paginatedData}
      />

      {/* Pagination */}
      {totalRows > 0 && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="text-xs sm:text-sm text-gray-700 text-center sm:text-left">
            Showing{" "}
            <span className="font-medium">
              {(currentPage - 1) * rowsPerPage + 1}
            </span>{" "}
            to{" "}
            <span className="font-medium">
              {Math.min(currentPage * rowsPerPage, totalRows)}
            </span>{" "}
            of <span className="font-medium">{totalRows}</span> MRs
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`p-1.5 sm:p-2 rounded-md ${
                currentPage === 1
                  ? "text-gray-400 cursor-not-allowed bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"
              }`}
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            {getPageNumbers().map((page, index) => (
              <button
                key={index}
                onClick={() =>
                  typeof page === "number" && handlePageChange(page)
                }
                disabled={typeof page !== "number"}
                className={`min-w-[32px] sm:min-w-[36px] h-8 sm:h-9 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium ${
                  page === currentPage
                    ? "bg-orange-600 text-white"
                    : typeof page === "number"
                      ? "text-gray-700 hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"
                      : "text-gray-500 cursor-default"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`p-1.5 sm:p-2 rounded-md ${
                currentPage === totalPages
                  ? "text-gray-400 cursor-not-allowed bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"
              }`}
            >
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
