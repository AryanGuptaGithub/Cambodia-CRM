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
      <div className="bg-white rounded-lg shadow-lg w-11/12 md:w-3/4 lg:w-1/2 p-4 relative">
        <DataTable
          title={`${productName} - Batch Details`}
          columns={columns}
          data={batches || []}
          loading={false}
          emptyText="No batch data available."
        />

        {/* Bottom Close Button */}
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchDetailsModal;
