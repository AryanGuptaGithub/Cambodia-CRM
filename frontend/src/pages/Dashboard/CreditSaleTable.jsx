import React, { useState } from "react";
import { formatCurrency } from "./DashboardUtil";
import { formatDateToReadable } from "../../utils/dateUtil";
import { Eye } from "lucide-react";

export const CreditSaleTable = ({ creditSaleData, loading }) => {
  const [activeTab, setActiveTab] = useState("invoice"); // "invoice" or "mr"
  const [selectedMR, setSelectedMR] = useState(null);
  const [showMRDetails, setShowMRDetails] = useState(false);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Credit Sale Cash Not Received
        </h3>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading credit sale data...</p>
        </div>
      </div>
    );
  }

  if (!creditSaleData || creditSaleData.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Credit Sale Cash Not Received
        </h3>
        <div className="text-center py-8">
          <p className="text-gray-500">
            No credit sales found where cash is not received
          </p>
          <p className="text-sm text-gray-400 mt-2">
            All credit sales have been paid or no outstanding credit sales exist
          </p>
        </div>
      </div>
    );
  }

  // Calculate MR-wise totals
  const mrWiseData = creditSaleData.reduce((acc, invoice) => {
    const mrName = invoice.mrName || "Unknown MR";
    const outstandingAmount = invoice.outstandingAmount || 0;
    const dueDate = invoice.dueDate || invoice.invoiceDate;
    const customerName = invoice.customerName || "Unknown Customer";
    
    // Calculate days overdue if dueDate exists
    const daysOverdue = dueDate ? Math.max(0, Math.floor((new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24))) : 0;
    
    if (!acc[mrName]) {
      acc[mrName] = {
        mrName,
        customers: new Set(),
        customerInvoices: {},
        totalOutstanding: 0,
        invoiceCount: 0,
      };
    }
    
    acc[mrName].customers.add(customerName);
    acc[mrName].invoiceCount += 1;
    acc[mrName].totalOutstanding += outstandingAmount;
    
    // Group by customer name
    if (!acc[mrName].customerInvoices[customerName]) {
      acc[mrName].customerInvoices[customerName] = {
        customerName,
        totalAmount: 0,
        earliestDueDate: dueDate,
        maxDaysOverdue: daysOverdue,
        invoiceCount: 0
      };
    }
    
    acc[mrName].customerInvoices[customerName].totalAmount += outstandingAmount;
    acc[mrName].customerInvoices[customerName].invoiceCount += 1;
    
    // Keep the earliest due date if available
    if (dueDate) {
      if (!acc[mrName].customerInvoices[customerName].earliestDueDate || 
          new Date(dueDate) < new Date(acc[mrName].customerInvoices[customerName].earliestDueDate)) {
        acc[mrName].customerInvoices[customerName].earliestDueDate = dueDate;
      }
    }
    
    // Keep the maximum days overdue
    if (daysOverdue > acc[mrName].customerInvoices[customerName].maxDaysOverdue) {
      acc[mrName].customerInvoices[customerName].maxDaysOverdue = daysOverdue;
    }
    
    return acc;
  }, {});

  const mrWiseArray = Object.values(mrWiseData).map(mr => ({
    ...mr,
    customers: mr.customers.size,
    customerInvoicesArray: Object.values(mr.customerInvoices)
      .map(customer => ({
        ...customer,
        daysOverdue: customer.maxDaysOverdue
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount) // Sort by highest outstanding amount
  })).sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  // Calculate total outstanding amount
  const totalOutstandingAmount = creditSaleData.reduce((total, invoice) => {
    return total + (invoice.outstandingAmount || 0);
  }, 0);

  // Handle View MR Details
  const handleViewMRDetails = (mr) => {
    setSelectedMR(mr);
    setShowMRDetails(true);
  };

  // MR Details Modal - Grouped by customer
  const MRDetailsModal = () => {
    if (!showMRDetails || !selectedMR) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">
                MR: {selectedMR.mrName} - Customer Outstanding Summary
              </h3>
              <button
                onClick={() => setShowMRDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-4">
              <div className="text-sm text-gray-600">
                <span className="font-medium">Customers:</span> {selectedMR.customers}
              </div>
              <div className="text-sm text-gray-600">
                <span className="font-medium">Invoices:</span> {selectedMR.invoiceCount}
              </div>
              <div className="text-sm text-gray-600">
                <span className="font-medium">Total Outstanding:</span>{" "}
                <span className="font-medium text-red-600">
                  ${formatCurrency(selectedMR.totalOutstanding)}
                </span>
              </div>
            </div>
          </div>
          
          <div className="p-6 overflow-auto max-h-[calc(90vh-120px)]">
            <table className="min-w-full divide-y divide-gray-200 text-center">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Due Date
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Days Overdue
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Outstanding Amount
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoices
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {selectedMR.customerInvoicesArray.map((customer, index) => (
                  <tr key={`${customer.customerName}-${index}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {customer.customerName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {customer.earliestDueDate ? formatDateToReadable(customer.earliestDueDate) : "N/A"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        customer.daysOverdue > 90 ? 'bg-red-100 text-red-800' :
                        customer.daysOverdue > 60 ? 'bg-orange-100 text-orange-800' :
                        customer.daysOverdue > 30 ? 'bg-yellow-100 text-yellow-800' :
                        customer.daysOverdue > 0 ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {customer.daysOverdue} {customer.daysOverdue === 1 ? 'day' : 'days'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-red-600">
                      ${formatCurrency(customer.totalAmount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {customer.invoiceCount}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan="2" className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                    Total:
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {selectedMR.customerInvoicesArray.length} customers
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-red-600">
                    ${formatCurrency(selectedMR.totalOutstanding)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {selectedMR.invoiceCount} invoices
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          <div className="p-6 border-t border-gray-200 flex justify-end">
            <button
              onClick={() => setShowMRDetails(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Credit Sale Cash Not Received
            </h3>
            
            <div className="flex items-center gap-4">
              {/* Tabs */}
              <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                <button
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === "invoice"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={() => setActiveTab("invoice")}
                >
                  Invoice Wise
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === "mr"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={() => setActiveTab("mr")}
                >
                  MR Wise
                </button>
              </div>
              
              <div className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                Total Outstanding:{" "}
                <span className="text-red-600">
                  {formatCurrency(totalOutstandingAmount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {activeTab === "invoice" ? (
          // Invoice Wise Table
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-center">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice #
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    MR Name
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Amount
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paid Amount
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Outstanding
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {creditSaleData.map((invoice, index) => (
                  <tr key={invoice._id || index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {invoice.invoiceNumber || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.invoiceDate
                        ? formatDateToReadable(invoice.invoiceDate)
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.mrName || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.customerName || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {formatCurrency(invoice.totalAmount || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                      {formatCurrency(invoice.paidAmount || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                      {formatCurrency(invoice.outstandingAmount || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          invoice.paymentStatus === "Paid"
                            ? "bg-green-100 text-green-800"
                            : invoice.paymentStatus === "Partial Paid"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {invoice.paymentStatus || "Credit"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // MR Wise Table
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-center">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    MR Name
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customers
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoices
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Outstanding ($)
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mrWiseArray.map((mr, index) => (
                  <tr key={mr.mrName || index} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {mr.mrName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {mr.customers}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {mr.invoiceCount}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-red-600">
                      ${formatCurrency(mr.totalOutstanding)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleViewMRDetails(mr)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
                      >
                        <Eye size={14} />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan="2" className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                    Total:
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {mrWiseArray.reduce((sum, mr) => sum + mr.invoiceCount, 0)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-red-600">
                    ${formatCurrency(mrWiseArray.reduce((sum, mr) => sum + mr.totalOutstanding, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* MR Details Modal */}
      <MRDetailsModal />
    </>
  );
};