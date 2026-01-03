import React, { useState } from "react";
import { formatCurrency } from "./DashboardUtil";
import { formatDateToReadable } from "../../utils/dateUtil";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";

export const OverdueTable = ({ overdueData, loading }) => {
  const [activeTab, setActiveTab] = useState("invoice"); // "invoice" or "mr"
  const [selectedMR, setSelectedMR] = useState(null);
  const [showMRDetails, setShowMRDetails] = useState(false);
  
  // Pagination states
  const [invoiceCurrentPage, setInvoiceCurrentPage] = useState(1);
  const [mrCurrentPage, setMrCurrentPage] = useState(1);
  const rowsPerPage = 5;

  // Reset pagination when tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setInvoiceCurrentPage(1);
    setMrCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!overdueData || overdueData.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Overdue Invoices</h3>
        <div className="text-center py-8">
          <p className="text-gray-500">No overdue invoices found</p>
        </div>
      </div>
    );
  }

  // Calculate MR-wise totals
  const mrWiseData = overdueData.reduce((acc, invoice) => {
    const mrName = invoice.mrName || "Unknown MR";
    const overdueAmount = invoice.dueAmount > 0 
      ? invoice.dueAmount 
      : Math.max(0, invoice.totalAmount - (invoice.paidAmount || 0));
    const daysOverdue = Math.max(0, Math.floor((new Date() - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24)));
    const customerName = invoice.customerName || "Unknown Customer";
    const dueDate = invoice.dueDate;
    
    if (!acc[mrName]) {
      acc[mrName] = {
        mrName,
        customers: new Set(),
        customerInvoices: {},
        totalOverdue: 0,
        invoiceCount: 0,
      };
    }
    
    acc[mrName].customers.add(customerName);
    acc[mrName].invoiceCount += 1;
    acc[mrName].totalOverdue += overdueAmount;
    
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
    
    acc[mrName].customerInvoices[customerName].totalAmount += overdueAmount;
    acc[mrName].customerInvoices[customerName].invoiceCount += 1;
    
    // Keep the earliest due date
    if (new Date(dueDate) < new Date(acc[mrName].customerInvoices[customerName].earliestDueDate)) {
      acc[mrName].customerInvoices[customerName].earliestDueDate = dueDate;
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
    customerList: Array.from(mr.customers),
    customerInvoicesArray: Object.values(mr.customerInvoices)
      .map(customer => ({
        ...customer,
        daysOverdue: customer.maxDaysOverdue
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount) // Sort by highest overdue amount
  })).sort((a, b) => b.totalOverdue - a.totalOverdue);

  // Calculate total overdue amount
  const totalOverdueAmount = overdueData.reduce(
    (sum, invoice) => {
      const overdueAmount = invoice.dueAmount > 0 
        ? invoice.dueAmount 
        : Math.max(0, invoice.totalAmount - (invoice.paidAmount || 0));
      return sum + overdueAmount;
    },
    0
  );

  // Pagination calculations for invoice tab
  const invoiceTotalPages = Math.ceil(overdueData.length / rowsPerPage);
  const invoiceStartIndex = (invoiceCurrentPage - 1) * rowsPerPage;
  const invoiceEndIndex = invoiceStartIndex + rowsPerPage;
  const invoicePaginatedData = overdueData.slice(invoiceStartIndex, invoiceEndIndex);

  // Pagination calculations for MR tab
  const mrTotalPages = Math.ceil(mrWiseArray.length / rowsPerPage);
  const mrStartIndex = (mrCurrentPage - 1) * rowsPerPage;
  const mrEndIndex = mrStartIndex + rowsPerPage;
  const mrPaginatedData = mrWiseArray.slice(mrStartIndex, mrEndIndex);

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
                MR: {selectedMR.mrName} - Customer Overdue Summary
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
                <span className="font-medium">Total Overdue:</span>{" "}
                <span className="font-medium text-red-600">
                  ${formatCurrency(selectedMR.totalOverdue)}
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
                    Total Overdue Amount
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
                      {formatDateToReadable(customer.earliestDueDate)}
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
                    ${formatCurrency(selectedMR.totalOverdue)}
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

  // Pagination Component
  const Pagination = ({ currentPage, totalPages, onPageChange, dataType }) => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 sm:px-6">
        <div className="flex-1 flex justify-between sm:hidden">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
              currentPage === 1 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Previous
          </button>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
              currentPage === totalPages 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">
                {dataType === 'invoice' ? invoiceStartIndex + 1 : mrStartIndex + 1}
              </span> to <span className="font-medium">
                {dataType === 'invoice' 
                  ? Math.min(invoiceEndIndex, overdueData.length) 
                  : Math.min(mrEndIndex, mrWiseArray.length)
                }
              </span> of{' '}
              <span className="font-medium">
                {dataType === 'invoice' ? overdueData.length : mrWiseArray.length}
              </span> results
            </p>
          </div>
          <div>
            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
              <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 text-sm font-medium ${
                  currentPage === 1 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className="sr-only">Previous</span>
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => onPageChange(pageNum)}
                    className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                      currentPage === pageNum
                        ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                        : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              
              <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 text-sm font-medium ${
                  currentPage === totalPages 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className="sr-only">Next</span>
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </nav>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-md border border-gray-200">
        <div className="p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h3 className="text-lg font-semibold text-gray-800">Overdue Invoices</h3>
            
            <div className="flex items-center gap-4">
              {/* Tabs */}
              <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                <button
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === "invoice"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={() => handleTabChange("invoice")}
                >
                  Invoice Wise
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === "mr"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={() => handleTabChange("mr")}
                >
                  MR Wise
                </button>
              </div>
              
              <div className="text-sm font-medium text-red-600">
                Total Overdue: ${formatCurrency(totalOverdueAmount)}
              </div>
            </div>
          </div>

          {activeTab === "invoice" ? (
            // Invoice Wise Table
            <div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-center">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Invoice No
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Invoice Date
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MR Name
                      </th>
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
                        Overdue Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoicePaginatedData.map((invoice) => {
                      const dueDate = new Date(invoice.dueDate);
                      const today = new Date();
                      const daysOverdue = Math.max(0, Math.floor((today - dueDate) / (1000 * 60 * 60 * 24)));
                      
                      const overdueAmount = invoice.dueAmount > 0 
                        ? invoice.dueAmount 
                        : Math.max(0, invoice.totalAmount - (invoice.paidAmount || 0));

                      return (
                        <tr key={invoice._id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {invoice.invoiceNumber || "N/A"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {formatDateToReadable(invoice.invoiceDate)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {invoice.mrName || "N/A"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {invoice.customerName || "N/A"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {new Date(invoice.dueDate).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              daysOverdue > 90 ? 'bg-red-100 text-red-800' :
                              daysOverdue > 60 ? 'bg-orange-100 text-orange-800' :
                              daysOverdue > 30 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {daysOverdue} days
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-red-600">
                            ${formatCurrency(overdueAmount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={invoiceCurrentPage}
                totalPages={invoiceTotalPages}
                onPageChange={setInvoiceCurrentPage}
                dataType="invoice"
              />
            </div>
          ) : (
            // MR Wise Table
            <div>
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
                        Total Overdue ($)
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {mrPaginatedData.map((mr, index) => (
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
                          ${formatCurrency(mr.totalOverdue)}
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
                </table>
              </div>
              <Pagination
                currentPage={mrCurrentPage}
                totalPages={mrTotalPages}
                onPageChange={setMrCurrentPage}
                dataType="mr"
              />
            </div>
          )}
        </div>
      </div>

      {/* MR Details Modal */}
      <MRDetailsModal />
    </>
  );
};