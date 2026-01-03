import React, { useState, useMemo } from "react";
import { ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "./DashboardUtil";
import { DataTable } from "./DataTable";

export const SalesTable = ({
  salesTableData,
  loadingSalesData,
  activeSalesSubTab,
  dateRanges,
  onViewProducts,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  // Group sales data by MR
  const groupedSalesData = useMemo(() => {
    const mrGroups = {};
    salesTableData.forEach((sale) => {
      if (!mrGroups[sale.salesPerson]) {
        mrGroups[sale.salesPerson] = {
          mrName: sale.salesPerson,
          totalAmount: 0,
          products: [],
          productCount: 0,
          customers: new Set(),
        };
      }
      mrGroups[sale.salesPerson].totalAmount += sale.amount;
      mrGroups[sale.salesPerson].products.push(sale);
      mrGroups[sale.salesPerson].productCount += 1;
      if (sale.customer && sale.customer !== "N/A") {
        mrGroups[sale.salesPerson].customers.add(sale.customer);
      }
    });

    Object.values(mrGroups).forEach((mr) => {
      mr.customerCount = mr.customers.size;
    });

    return Object.values(mrGroups);
  }, [salesTableData]);

  // Calculate pagination
  const totalRows = groupedSalesData.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  
  // Get data for current page
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return groupedSalesData.slice(startIndex, endIndex);
  }, [groupedSalesData, currentPage]);

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
      // Show all pages if total pages is less than maxVisiblePages
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

  // Reset to page 1 when activeSalesSubTab changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [activeSalesSubTab]);

  const getTableTitle = () => {
    switch (activeSalesSubTab) {
      case "Today":
        return `Sales Details - ${dateRanges.today.label}`;
      case "Month":
        return `Sales Details - ${dateRanges.month.label}`;
      case "Year":
        return `Sales Details - ${dateRanges.year.rangeLabel}`;
      default:
        return `Sales Details - ${activeSalesSubTab}`;
    }
  };

  return (
    <div className="space-y-4">
      <DataTable
        title={getTableTitle()}
        loading={loadingSalesData}
        loadingText="Loading sales data..."
        emptyText={`No sales data found for ${activeSalesSubTab}`}
        columns={[
          { header: "MR Name", accessor: "mrName", className: "capitalize" },
          {
            header: "Products",
            render: (row) =>
              row.productCount === 1 ? (
                row.products[0].productName
              ) : (
                <span>{row.productCount} Products</span>
              ),
          },
          {
            header: "Customer",
            render: (row) =>
              row.customerCount === 1 ? (
                Array.from(row.customers)[0]
              ) : (
                <span>{row.customerCount} customers</span>
              ),
          },
          {
            header: "Total Amount ($)",
            render: (row) => (
              <span className="text-green-600 font-semibold">
                ${formatCurrency(row.totalAmount)}
              </span>
            ),
          },
          {
            header: "Actions",
            render: (row) => (
              <button
                onClick={() => onViewProducts(row.mrName, row.products)}
                className="text-gray-400 hover:text-blue-600 transition-colors cursor-pointer p-2"
                title="View All Products"
              >
                <ShoppingCart size={20} />
              </button>
            ),
          },
        ]}
        data={paginatedData}
      />

      {/* Pagination Controls - Only show if we have data */}
      {totalRows > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 rounded-b-lg shadow-sm">
          <div className="text-sm text-gray-700">
            Showing <span className="font-medium">{(currentPage - 1) * rowsPerPage + 1}</span> to{" "}
            <span className="font-medium">
              {Math.min(currentPage * rowsPerPage, totalRows)}
            </span>{" "}
            of <span className="font-medium">{totalRows}</span> results
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Previous Page Button */}
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`flex items-center justify-center p-2 rounded-md ${
                currentPage === 1
                  ? "text-gray-400 cursor-not-allowed bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"
              }`}
              aria-label="Previous page"
            >
              <ChevronLeft size={18} />
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
              className={`flex items-center justify-center p-2 rounded-md ${
                currentPage === totalPages
                  ? "text-gray-400 cursor-not-allowed bg-gray-100"
                  : "text-gray-700 hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"
              }`}
              aria-label="Next page"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Show page info if only one page */}
      {totalRows > 0 && totalPages === 1 && (
        <div className="text-sm text-gray-500 text-center py-2 bg-white border border-gray-200 rounded-lg px-4">
          Showing all {totalRows} results (Page 1 of 1)
        </div>
      )}
    </div>
  );
};