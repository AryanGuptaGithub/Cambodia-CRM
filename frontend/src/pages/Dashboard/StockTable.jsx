import React from "react";
import { DataTable } from "./DataTable";
import { formatCurrency } from "./DashboardUtil";

export const StockTable = ({
  stockTableData,
  loadingStockData,
  activeStockSubTab,
  dateRanges,
  onViewStockDetails, // function to show batch-wise LC in modal
}) => {
  // Columns for main stock table (shows average LC)
  const columns = [
    {
      header: "Product Name",
      accessor: "productName",
      render: (item) => (
        <span className="text-gray-800 font-medium">{item.productName}</span>
      ),
    },
    {
      header: "Supplier",
      accessor: "supplierName",
    },
    {
      header: "Quantity (Boxes)",
      render: (item) =>
        item.batches?.reduce((sum, batch) => sum + (batch.boxes || 0), 0) || 0,
    },
    {
      header: "LC Price ($)", // Average LC per product
      render: (item) => {
        const totalBoxes = item.batches?.reduce(
          (sum, batch) => sum + (batch.boxes || 0),
          0
        );
        const totalLC = item.batches?.reduce(
          (sum, batch) => sum + (batch.lc * (batch.boxes || 0)),
          0
        );
        const avgLC = totalBoxes ? totalLC / totalBoxes : 0;
        return formatCurrency(avgLC);
      },
    },
    {
      header: "Stock Value ($)",
      render: (item) => {
        const value = item.batches?.reduce(
          (sum, batch) => sum + (batch.lc * (batch.boxes || 0)),
          0
        );
        return (
          <span className="text-green-600 font-semibold">
            ${formatCurrency(value || 0)}
          </span>
        );
      },
    },
    {
      header: "Status",
      render: (item) => {
        const currentStock = item.batches?.reduce(
          (sum, batch) => sum + (batch.boxes || 0),
          0
        );
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
    {
      header: "Action",
      render: (item) => (
        <button
          className="bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
          onClick={() => onViewStockDetails(item.productName, item.batches)}
        >
          View
        </button>
      ),
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
