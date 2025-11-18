import React from "react";
import ReactDOM from "react-dom";
import { X } from "lucide-react";
import { formatCurrency } from "./DashboardUtil";
import { formatDateToReadable } from "../../utils/dateUtil";

const ProductsModal = ({
  showModal,
  onClose,
  selectedMRName,
  selectedMRProducts,
  activeTab,
}) => {
  if (!showModal) return null;
  const isOutstandingData = activeTab === "Outstanding";

  const modalContent = ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-6xl max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-gray-800">
              {isOutstandingData
                ? `Outstanding Invoices for ${selectedMRName}`
                : `All Products Sold by ${selectedMRName}`}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <X size={24} />
            </button>
          </div>
        </div>
        <div className="p-6">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow-2xl text-center">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {isOutstandingData ? (
                  <>
                    <th className="p-3 text-sm font-medium">Date</th>
                    <th className="p-3 text-sm font-medium">Invoice Number</th>
                    <th className="p-3 text-sm font-medium">Customer</th>
                    <th className="p-3 text-sm font-medium">Total Amount ($)</th>
                    <th className="p-3 text-sm font-medium">Paid Amount ($)</th>
                    <th className="p-3 text-sm font-medium">Due Amount ($)</th>
                    <th className="p-3 text-sm font-medium">Payment Status</th>
                    <th className="p-3 text-sm font-medium">Due Date</th>
                  </>
                ) : (
                  <>
                    <th className="p-3 text-sm font-medium">Date</th>
                    <th className="p-3 text-sm font-medium">Product Name</th>
                    <th className="p-3 text-sm font-medium">Quantity</th>
                    <th className="p-3 text-sm font-medium">Selling Price ($)</th>
                    <th className="p-3 text-sm font-medium">Amount ($)</th>
                    <th className="p-3 text-sm font-medium">Customer</th>
                    <th className="p-3 text-sm font-medium">Bonus Qty</th>
                    <th className="p-3 text-sm font-medium">Total Qty</th>
                  </>
                )}
              </tr>
            </thead>

            <tbody>
              {selectedMRProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={isOutstandingData ? 8 : 8}
                    className="p-4 text-center text-gray-500"
                  >
                    No data found.
                  </td>
                </tr>
              ) : (
                selectedMRProducts.map((item, index) => (
                  <tr
                    key={index}
                    className={`hover:bg-gray-50 ${
                      index < selectedMRProducts.length - 1 ? "border-b" : ""
                    }`}
                  >
                    {isOutstandingData ? (
                      <>
                        <td className="p-3 text-sm text-gray-700">
                          {formatDateToReadable(
                            item.recordingDate || item.invoiceDate
                          )}
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          {item.invoiceNumber}
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          {item.customerName}
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          ${formatCurrency(item.totalAmount)}
                        </td>
                        <td className="p-3 text-sm text-green-600 font-medium">
                          ${formatCurrency(item.paidAmount)}
                        </td>
                        <td className="p-3 text-sm text-orange-600 font-medium">
                          ${formatCurrency(item.dueAmount)}
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          <span
                            className={`px-2 py-1 rounded-full text-xs ${
                              item.paymentStatus === "Cash"
                                ? "bg-green-100 text-green-800"
                                : item.paymentStatus === "Partial Paid"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {item.paymentStatus}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          {formatDateToReadable(item.dueDate)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3 text-sm text-gray-700">
                          {formatDateToReadable(item.date)}
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          {item.productName}
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          {item.quantity}
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          ${formatCurrency(item.sellingPrice)}
                        </td>
                        <td className="p-3 text-sm text-green-600 font-medium">
                          ${formatCurrency(item.amount)}
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          {item.customer}
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          {item.bonusQty || 0}
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          {item.totalQty || item.quantity}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {selectedMRProducts.length === 0 && (
            <p className="text-center text-gray-500 py-4">No data found</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );

  return modalContent;
};

export default ProductsModal;