import React, { useState, useMemo, useEffect } from "react";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "./DashboardUtil";
import { DataTable } from "./DataTable";

export const OutstandingTable = ({
  outstandingTableData,
  loadingOutstandingData,
  activeOutstandingSubTab,
  dateRanges,
  onViewInvoices
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
      
      // Add outstanding amount
      const dueAmount = parseFloat(outstanding.dueAmount) || 0;
      mrGroups[mrName].totalOutstanding += dueAmount;
      
      // Add invoice
      mrGroups[mrName].invoices.push(outstanding);
      mrGroups[mrName].invoiceCount += 1;
      
      // Add customer if available
      if (outstanding.customerName && outstanding.customerName.trim() !== "") {
        mrGroups[mrName].customers.add(outstanding.customerName);
      }
    });

    // Convert Set to size for customer count
    Object.values(mrGroups).forEach((mr) => {
      mr.customerCount = mr.customers.size;
    });

    // Sort by total outstanding (highest first)
    const sortedGroups = Object.values(mrGroups).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
    
    return sortedGroups;
  }, [outstandingTableData]);

  // Calculate pagination values
  const totalRows = groupedOutstandingData.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  
  // Reset to page 1 when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeOutstandingSubTab]);

  // Get data for current page
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return groupedOutstandingData.slice(startIndex, endIndex);
  }, [groupedOutstandingData, currentPage]);

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

  const getTableTitle = () => {
    if (!dateRanges) {
      return `Outstanding Details - ${activeOutstandingSubTab || 'Outstanding'}`;
    }
    
    switch (activeOutstandingSubTab) {
      case "Today":
        return `Outstanding Details - ${dateRanges.today?.label || 'Today'}`;
      case "Month":
        return `Outstanding Details - ${dateRanges.month?.label || 'This Month'}`;
      case "Year":
        return `Outstanding Details - ${dateRanges.year?.rangeLabel || 'This Year'}`;
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
        return `Outstanding Details - ${activeOutstandingSubTab || 'Outstanding'}`;
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
            className: "capitalize font-medium text-gray-900" 
          },
          { 
            header: "Customers", 
            render: (row) => 
              row.customerCount === 1 
                ? <span className="text-gray-900">{Array.from(row.customers)[0] || 'N/A'}</span>
                : <span className="text-purple-600 font-medium">{row.customerCount} customers</span>
          },
          { 
            header: "Invoices", 
            render: (row) => 
              row.invoiceCount === 1 
                ? <span className="text-gray-900">{row.invoices[0]?.invoiceNumber || 'N/A'}</span>
                : <span className="text-blue-600 font-medium">{row.invoiceCount} invoices</span>
          },
          { 
            header: "Total Outstanding ($)", 
            render: (row) => 
              <div className="flex flex-col">
                <span className="text-orange-600 font-semibold text-base">
                  ${formatCurrency(row.totalOutstanding)}
                </span>
                {row.invoiceCount > 1 && (
                  <span className="text-xs text-gray-500">
                    Avg: ${formatCurrency(row.totalOutstanding / row.invoiceCount)}
                  </span>
                )}
              </div>
          },
          {
            header: "Actions",
            render: (row) => (
              <button
                onClick={() => onViewInvoices(row.mrName, row.invoices)}
                className="inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors duration-200"
                title="View All Invoices"
              >
                <Eye className="h-4 w-4 mr-1" />
                View Invoices
              </button>
            ),
            className: "text-center"
          }
        ]}
        data={paginatedData}
      />

      {/* Pagination Controls - Only show if we have data and more than one page */}
      {totalRows > 0 && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg shadow-sm">
          {/* Showing results info */}
          <div className="text-sm text-gray-700 mb-3 sm:mb-0">
            Showing <span className="font-medium">{(currentPage - 1) * rowsPerPage + 1}</span> to{" "}
            <span className="font-medium">
              {Math.min(currentPage * rowsPerPage, totalRows)}
            </span>{" "}
            of <span className="font-medium">{totalRows}</span> MRs
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
                    ? "bg-orange-600 text-white"
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
      )}

      {/* Show simple info if only one page */}
      {totalRows > 0 && totalPages === 1 && (
        <div className="text-sm text-gray-500 text-center py-2 bg-white border border-gray-200 rounded-lg px-4">
          Showing all {totalRows} MRs with outstanding payments (Page 1 of 1)
        </div>
      )}

      {/* No data message */}
      {!loadingOutstandingData && totalRows === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <Eye className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                No outstanding data available
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  There are no outstanding records for the selected period: <span className="font-medium">{activeOutstandingSubTab}</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};