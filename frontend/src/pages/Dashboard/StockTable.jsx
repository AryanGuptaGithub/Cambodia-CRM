import React, { useState, useMemo, useEffect } from "react";
import { DataTable } from "./DataTable";
import { formatCurrency } from "./DashboardUtil";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const StockTable = ({
  stockTableData,
  loadingStockData,
  activeStockSubTab,
  dateRanges,
  onViewStockDetails,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  console.log('values of stockTableData', stockTableData);

  const totalRows = stockTableData?.length || 0;
  const totalPages = Math.ceil(totalRows / rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeStockSubTab, stockTableData]);

  const paginatedData = useMemo(() => {
    if (!stockTableData || stockTableData.length === 0) return [];
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return stockTableData.slice(startIndex, endIndex);
  }, [stockTableData, currentPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  // ✅ Use totalAmount from backend for accurate totals
  const stockStats = useMemo(() => {
    if (!stockTableData || stockTableData.length === 0) {
      return { totalValue: 0, totalProducts: 0, totalBoxes: 0, lowStockCount: 0 };
    }

    let totalValue = 0;
    let totalBoxes = 0;
    let lowStockCount = 0;

    stockTableData.forEach((item) => {
      const currentStock = item.batches?.reduce(
        (sum, batch) => sum + (batch.boxes || 0), 0
      ) || 0;
      
      // ✅ Use item.totalAmount (already rounded)
      totalValue += item.totalAmount || 0;
      totalBoxes += currentStock;
      
      const minStockLevel = item.minStockLevel || 0;
      if (currentStock < minStockLevel) lowStockCount++;
    });

    return {
      totalValue,
      totalProducts: stockTableData.length,
      totalBoxes,
      lowStockCount,
    };
  }, [stockTableData]);

  const columns = [
    {
      header: "Product Name",
      accessor: "productName",
      render: (item) => (
        <div className="flex flex-col">
          <span className="text-gray-800 font-medium">{item.productName}</span>
          <span className="text-xs text-gray-500">
            Code: {item.productCode || "N/A"}
          </span>
        </div>
      ),
    },
    {
      header: "Supplier",
      accessor: "supplierName",
      render: (item) => (
        <span className="text-gray-700">{item.supplierName || "N/A"}</span>
      ),
    },
    {
      header: "Quantity (Boxes)",
      render: (item) => {
        const totalBoxes = item.batches?.reduce(
          (sum, batch) => sum + (batch.boxes || 0), 0
        ) || 0;
        const minStockLevel = item.minStockLevel || 0;
        const isLowStock = totalBoxes < minStockLevel;
        
        return (
          <div className="flex flex-col">
            <span className={`font-medium ${isLowStock ? "text-red-600" : "text-gray-800"}`}>
              {totalBoxes.toLocaleString()}
            </span>
            {minStockLevel > 0 && (
              <span className="text-xs text-gray-500">Min: {minStockLevel}</span>
            )}
          </div>
        );
      },
    },
    {
      header: "LC Price ($)",
      render: (item) => {
        const totalBoxes = item.batches?.reduce(
          (sum, batch) => sum + (batch.boxes || 0), 0
        ) || 0;
        const totalLC = item.batches?.reduce(
          (sum, batch) => sum + (batch.lc || 0) * (batch.boxes || 0), 0
        ) || 0;
        const avgLC = totalBoxes ? totalLC / totalBoxes : 0;
        
        return (
          <div className="flex flex-col">
            <span className="font-medium text-blue-600">
              ${avgLC.toFixed(3)}
            </span>
            <span className="text-xs text-gray-500">
              {item.batches?.length || 0} batch{item.batches?.length !== 1 ? 'es' : ''}
            </span>
          </div>
        );
      },
    },
    {
      header: "Stock Value ($)",
      // ✅ Use item.totalAmount instead of recomputing
      render: (item) => {
        const value = item.totalAmount || 0;
        return (
          <div className="flex flex-col">
            <span className="text-green-600 font-semibold">
              ${formatCurrency(value)}
            </span>
            <span className="text-xs text-gray-500">
              {formatCurrency(value / 1000)}k
            </span>
          </div>
        );
      },
    },
    {
      header: "Status",
      render: (item) => {
        const currentStock = item.batches?.reduce(
          (sum, batch) => sum + (batch.boxes || 0), 0
        ) || 0;
        const minStockLevel = item.minStockLevel || 0;
        const isLowStock = currentStock < minStockLevel;

        return (
          <span
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              isLowStock
                ? "bg-red-100 text-red-800"
                : "bg-green-100 text-green-800"
            }`}
          >
            {isLowStock ? "Low Stock" : "In Stock"}
          </span>
        );
      },
      className: "text-center",
    },
    {
      header: "Action",
      render: (item) => (
        <button
          className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          onClick={() => onViewStockDetails(item.productName, item.batches)}
          title="View batch details"
        >
          View Details
        </button>
      ),
      className: "text-center",
    },
  ];

  const getTableTitle = () => {
    if (!dateRanges) return `Stock Details - ${activeStockSubTab || 'Stock'}`;
    switch (activeStockSubTab) {
      case "Today": return `Stock Details - ${dateRanges.today?.label || 'Today'}`;
      case "Low Stock": return "Low Stock Alert - Products Below Minimum Level";
      case "Expiring": return "Expiring Soon - Products Near Expiry Date";
      case "All": return "Complete Stock Inventory";
      case "Overdue": return "Overdue Stock - Past Expiry Date";
      case "Unreceive_Payment": return "Pending Receipt Stock";
      default: return `Stock Details - ${activeStockSubTab || 'Stock'}`;
    }
  };

  return (
    <div className="space-y-6">
      {!loadingStockData && stockStats.totalProducts > 0 && (
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">
                {stockStats.totalProducts}
              </div>
              <div className="text-sm text-gray-600">Total Products</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                ${formatCurrency(stockStats.totalValue)}
              </div>
              <div className="text-sm text-gray-600">Total Value</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {stockStats.totalBoxes.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Total Boxes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {stockStats.lowStockCount}
              </div>
              <div className="text-sm text-gray-600">Low Stock Items</div>
            </div>
          </div>
        </div>
      )}

      <DataTable
        title={getTableTitle()}
        loading={loadingStockData}
        loadingText="Loading stock data..."
        emptyText={`No stock data found for ${activeStockSubTab}`}
        columns={columns}
        data={paginatedData}
      />

      {totalRows > 0 && totalPages > 1 && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
            <div className="text-sm text-gray-700">
              <span className="font-medium">Page {currentPage} of {totalPages}</span>
              <span className="mx-2">•</span>
              <span>
                Showing <span className="font-medium">{(currentPage - 1) * rowsPerPage + 1}</span> to{" "}
                <span className="font-medium">
                  {Math.min(currentPage * rowsPerPage, totalRows)}
                </span>{" "}
                of <span className="font-medium">{totalRows}</span> products
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
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

      {totalRows > 0 && totalPages === 1 && (
        <div className="text-sm text-gray-500 text-center py-2 bg-white border border-gray-200 rounded-lg px-4">
          Showing all {totalRows} products (Page 1 of 1)
        </div>
      )}
    </div>
  );
};