import React, { useState, useMemo, useEffect } from "react";
import { ShoppingCart, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { formatCurrency } from "./DashboardUtil";
import { DataTable } from "./DataTable";

export const SalesTable = ({
  salesTableData,
  loadingSalesData,
  activeSalesSubTab,
  dateRanges,
  onViewProducts,
  isCustomDateActive,
  customDateRange,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  const groupedSalesData = useMemo(() => {
    const mrGroups = {};
    (salesTableData || []).forEach((sale) => {
      const key = sale.salesPerson || sale.mrName || "Unknown";
      if (!mrGroups[key])
        mrGroups[key] = {
          mrName: key,
          totalAmount: 0,
          products: [],
          productCount: 0,
          customers: new Set(),
          customerCount: 0,
        };
      mrGroups[key].totalAmount += sale.amount || 0;
      mrGroups[key].products.push(sale);
      mrGroups[key].productCount += 1;
      const customer = sale.customer || sale.customerName;
      if (customer && customer !== "N/A") mrGroups[key].customers.add(customer);
    });
    return Object.values(mrGroups)
      .map((mr) => ({ ...mr, customerCount: mr.customers.size }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [salesTableData]);

  const totalRows = groupedSalesData.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return groupedSalesData.slice(start, start + rowsPerPage);
  }, [groupedSalesData, currentPage]);

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
  useEffect(() => setCurrentPage(1), [activeSalesSubTab]);

  const getTableTitle = () => {
    if (isCustomDateActive && customDateRange)
      return `Sales Details - ${customDateRange}`;
    switch (activeSalesSubTab) {
      case "Today":
        return `Sales Details - ${dateRanges?.today?.label || "Today"}`;
      case "Month":
        return `Sales Details - ${dateRanges?.month?.label || "This Month"}`;
      case "Year":
        return `Sales Details - ${dateRanges?.year?.rangeLabel || "This Year"}`;
      default:
        return `Sales Details - ${activeSalesSubTab}`;
    }
  };

  const getRankBadge = (globalIndex) => (
    <span className="text-xs font-bold text-gray-500">#{globalIndex + 1}</span>
  );

  return (
    <div className="space-y-4">
      <DataTable
        title={getTableTitle()}
        loading={loadingSalesData}
        loadingText="Loading sales data..."
        emptyText={`No sales data found for ${activeSalesSubTab}`}
        columns={[
          {
            header: "Rank",
            render: (row, index) => {
              const globalIndex = (currentPage - 1) * rowsPerPage + index;
              return (
                <div className="flex items-center justify-center">
                  {getRankBadge(globalIndex)}
                </div>
              );
            },
          },
          {
            header: "MR Name",
            render: (row) => (
              <span className="capitalize font-medium text-gray-800">
                {row.mrName}
              </span>
            ),
          },
          {
            header: "Products",
            render: (row) =>
              row.productCount === 1 ? (
                <span className="text-gray-700">
                  {row.products[0]?.productName || "1 product"}
                </span>
              ) : (
                <span className="text-gray-700">
                  {row.productCount} products
                </span>
              ),
          },
          {
            header: "Customer",
            render: (row) => {
              if (row.customerCount === 0)
                return <span className="text-gray-400">—</span>;
              if (row.customerCount === 1)
                return (
                  <span className="text-gray-700">
                    {Array.from(row.customers)[0]}
                  </span>
                );
              return (
                <span className="text-gray-700">
                  {row.customerCount} customers
                </span>
              );
            },
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
                title="View Products"
              >
                <ShoppingCart size={20} />
              </button>
            ),
          },
        ]}
        data={paginatedData}
      />

      {totalRows > 0 && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border-t border-gray-200 rounded-b-lg shadow-sm">
          <div className="text-xs sm:text-sm text-gray-700">
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
              className={`p-1.5 sm:p-2 rounded-md ${currentPage === 1 ? "text-gray-400 cursor-not-allowed bg-gray-100" : "text-gray-700 hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"}`}
            >
              <ChevronLeft size={16} className="sm:w-5 sm:h-5" />
            </button>
            {getPageNumbers().map((page, idx) => (
              <button
                key={idx}
                onClick={() =>
                  typeof page === "number" && handlePageChange(page)
                }
                disabled={typeof page !== "number"}
                className={`min-w-[32px] sm:min-w-[36px] h-8 sm:h-9 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium ${page === currentPage ? "bg-blue-600 text-white" : typeof page === "number" ? "text-gray-700 hover:bg-gray-100 cursor-pointer bg-white border border-gray-300" : "text-gray-500 cursor-default"}`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`p-1.5 sm:p-2 rounded-md ${currentPage === totalPages ? "text-gray-400 cursor-not-allowed bg-gray-100" : "text-gray-700 hover:bg-gray-100 cursor-pointer bg-white border border-gray-300"}`}
            >
              <ChevronRight size={16} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      )}
      {totalRows > 0 && totalPages === 1 && (
        <div className="text-sm text-gray-500 text-center py-2 bg-white border border-gray-200 rounded-lg px-4">
          Showing all {totalRows} {totalRows === 1 ? "MR" : "MRs"}
        </div>
      )}
    </div>
  );
};

export const HighestSalesByMR = ({
  salesTableData = [],
  loadingSalesData = false,
  activeSalesSubTab = "Month",
  onViewProducts,
  dateRanges,
}) => {
  const topMRs = useMemo(() => {
    const mrGroups = {};
    (salesTableData || []).forEach((sale) => {
      const key = sale.salesPerson || sale.mrName || "Unknown";
      if (!mrGroups[key])
        mrGroups[key] = {
          mrName: key,
          totalAmount: 0,
          products: [],
          productCount: 0,
          customers: new Set(),
        };
      mrGroups[key].totalAmount += sale.amount || 0;
      mrGroups[key].products.push(sale);
      mrGroups[key].productCount += 1;
      const customer = sale.customer || sale.customerName;
      if (customer && customer !== "N/A") mrGroups[key].customers.add(customer);
    });
    return Object.values(mrGroups)
      .map((mr) => ({ ...mr, customerCount: mr.customers.size }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);
  }, [salesTableData]);

  const getPeriodLabel = () => {
    switch (activeSalesSubTab) {
      case "Today":
        return dateRanges?.today?.label || "Today";
      case "Month":
        return dateRanges?.month?.label || "This Month";
      case "Year":
        return dateRanges?.year?.rangeLabel || "This Year";
      default:
        return activeSalesSubTab;
    }
  };

  if (loadingSalesData)
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
          >
            <div className="w-7 h-7 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-2/3" />
              <div className="h-2 bg-gray-200 rounded w-1/3" />
            </div>
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
    );
  if (topMRs.length === 0)
    return (
      <div className="text-center py-8 text-gray-400">
        <Trophy size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">No sales data for {getPeriodLabel()}</p>
      </div>
    );

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">
        {getPeriodLabel()}
      </p>
      {topMRs.map((mr, index) => (
        <div
          key={mr.mrName}
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors group"
        >
          <div className="flex-shrink-0 w-8 text-center">
            <span className="text-sm font-bold text-gray-400">
              #{index + 1}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 capitalize truncate">
              {mr.mrName}
            </p>
            <p className="text-xs text-gray-500">
              {mr.productCount} {mr.productCount === 1 ? "product" : "products"}
              {mr.customerCount > 0 && (
                <span className="ml-1">
                  · {mr.customerCount}{" "}
                  {mr.customerCount === 1 ? "customer" : "customers"}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-sm font-bold text-green-600">
              ${formatCurrency(mr.totalAmount)}
            </span>
            {onViewProducts && (
              <button
                onClick={() => onViewProducts(mr.mrName, mr.products)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600 cursor-pointer"
              >
                <ShoppingCart size={15} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
