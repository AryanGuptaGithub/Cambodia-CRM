import React from "react";
import { DataTable } from "./DataTable";
import { formatCurrency } from "./DashboardUtil";

const BatchDetailsModal = ({ showModal, onClose, productName, batches }) => {
  if (!showModal) return null;

  const columns = [
    {
      header: "Date",
      accessor: "date",
      render: (batch) => new Date(batch.date).toLocaleDateString("en-US"),
    },
    {
      header: "Product Name",
      accessor: "productName",
      render: () => productName,
    },
    {
      header: "Quantity (Boxes)",
      accessor: "boxes",
      render: (batch) => batch.boxes || 0,
    },
    {
      header: "Selling Price ($)",
      accessor: "lc", 
      render: (batch) => formatCurrency(batch.lc || 0),
    },
    {
      header: "Amount ($)",
      accessor: "amount",
      render: (batch) => {
        const boxes = batch.boxes || 0;
        const lc = batch.lc || 0;
        return formatCurrency(boxes * lc);
      },
    },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-11/12 md:w-3/4 lg:w-1/2 p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">{productName} - Batch Details</h2>
          <button
            className="text-gray-500 hover:text-gray-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <DataTable
          title={`Batch-wise Details`}
          columns={columns}
          data={batches || []}
          loading={false}
          emptyText="No batch data available."
        />
      </div>
    </div>
  );
};

export default BatchDetailsModal;