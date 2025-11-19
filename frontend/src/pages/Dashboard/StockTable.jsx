// StockTable.jsx
import React from "react";
import { DataTable } from "./DataTable";
import { formatCurrency } from "./DashboardUtil";

export const StockTable = ({
  stockTableData,
  loadingStockData,
  activeStockSubTab,
  dateRanges,
  onViewStockDetails,
}) => {
  const columns = [
    {
      header: "Product Name",
      accessor: "productName",
    },
    {
      header: "Supplier",
      accessor: "supplierName",
    },

    {
      header: "Quantity (Boxes)",
      render: (item) => item.quantity?.boxes || 0,
    },
    {
      header: "LC Price ($)",
      render: (item) => formatCurrency(item.lc || 0),
    },
    {
      header: "Stock Value ($)",
      render: (item) => {
        const quantity = item.quantity?.boxes || 0;
        const lc = item.lc || 0;
        const value = quantity * lc;
        return (
          <span className="text-green-600 font-semibold">
            ${formatCurrency(value)}
          </span>
        );
      },
      
    },
    {
      header: "Status",
      render: (item) => {
        const currentStock = item.quantity?.boxes || 0;
        const minStockLevel = item.minStockLevel || 0;
        const isLowStock = currentStock < minStockLevel;

        return (
          <span
            className={`px-2 py-1 rounded-full text-xs ${
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
  ];

  const getTableTitle = () => {
    switch (activeStockSubTab) {
      case "Today":
        return `Stock Details - ${dateRanges.today.label}`;
      default:
        return `Stock Details - ${activeStockSubTab}`;
    }
  };

  return (
    <DataTable
      title={getTableTitle()}
      loading={loadingStockData}
      loadingText="Loading stock data..."
      emptyText={`No stock data found for ${activeStockSubTab}`}
      columns={columns}
      data={stockTableData}
    />
  );
};
