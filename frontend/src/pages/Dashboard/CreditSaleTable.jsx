import React, { useState, useMemo, useEffect } from "react";
import { formatCurrency } from "./DashboardUtil";
import { formatDateToReadable } from "../../utils/dateUtil";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";

export const CreditSaleTable = ({ creditSaleData, loading }) => {
  const [activeTab, setActiveTab] = useState("invoice");
  const [selectedMR, setSelectedMR] = useState(null);
  const [showMRDetails, setShowMRDetails] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  // MR-wise data
  const mrWiseData = useMemo(() => {
    if (!creditSaleData || creditSaleData.length === 0) return [];
    const mrWise = creditSaleData.reduce((acc, invoice) => {
      const mrName = invoice.mrName || "Unknown MR";
      const outstandingAmount = invoice.outstandingAmount || 0;
      const dueDate = invoice.dueDate || invoice.invoiceDate;
      const customerName = invoice.customerName || "Unknown Customer";
      const daysOverdue = dueDate
        ? Math.max(
            0,
            Math.floor(
              (new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24),
            ),
          )
        : 0;

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
      acc[mrName].invoiceCount++;
      acc[mrName].totalOutstanding += outstandingAmount;

      if (!acc[mrName].customerInvoices[customerName]) {
        acc[mrName].customerInvoices[customerName] = {
          customerName,
          totalAmount: 0,
          earliestDueDate: dueDate,
          maxDaysOverdue: daysOverdue,
          invoiceCount: 0,
        };
      }
      acc[mrName].customerInvoices[customerName].totalAmount +=
        outstandingAmount;
      acc[mrName].customerInvoices[customerName].invoiceCount++;
      if (
        dueDate &&
        (!acc[mrName].customerInvoices[customerName].earliestDueDate ||
          new Date(dueDate) <
            new Date(
              acc[mrName].customerInvoices[customerName].earliestDueDate,
            ))
      ) {
        acc[mrName].customerInvoices[customerName].earliestDueDate = dueDate;
      }
      if (
        daysOverdue > acc[mrName].customerInvoices[customerName].maxDaysOverdue
      ) {
        acc[mrName].customerInvoices[customerName].maxDaysOverdue = daysOverdue;
      }
      return acc;
    }, {});
    return Object.values(mrWise)
      .map((mr) => ({
        ...mr,
        customers: mr.customers.size,
        customerInvoicesArray: Object.values(mr.customerInvoices)
          .map((c) => ({ ...c, daysOverdue: c.maxDaysOverdue }))
          .sort((a, b) => b.totalAmount - a.totalAmount),
      }))
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }, [creditSaleData]);

  const totalOutstandingAmount = useMemo(
    () =>
      creditSaleData?.reduce((t, i) => t + (i.outstandingAmount || 0), 0) || 0,
    [creditSaleData],
  );
  const totalInvoiceCount = creditSaleData?.length || 0;
  const uniqueMRCount = useMemo(
    () => new Set(creditSaleData?.map((i) => i.mrName)).size,
    [creditSaleData],
  );

  // Pagination for invoice tab
  const totalInvoicePages = Math.ceil(
    (creditSaleData?.length || 0) / rowsPerPage,
  );
  const paginatedInvoiceData = useMemo(() => {
    if (!creditSaleData) return [];
    const start = (currentPage - 1) * rowsPerPage;
    return creditSaleData.slice(start, start + rowsPerPage);
  }, [creditSaleData, currentPage]);

  // Pagination for MR tab
  const totalMRPages = Math.ceil(mrWiseData.length / rowsPerPage);
  const paginatedMRData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return mrWiseData.slice(start, start + rowsPerPage);
  }, [mrWiseData, currentPage]);

  useEffect(() => setCurrentPage(1), [activeTab]);

  const handlePageChange = (page) => {
    const total = activeTab === "invoice" ? totalInvoicePages : totalMRPages;
    if (page >= 1 && page <= total) setCurrentPage(page);
  };

  const getPageNumbers = (total) => {
    const pages = [];
    const max = 5;
    if (total <= max) for (let i = 1; i <= total; i++) pages.push(i);
    else if (currentPage <= 3) {
      for (let i = 1; i <= 4; i++) pages.push(i);
      pages.push("...");
      pages.push(total);
    } else if (currentPage >= total - 2) {
      pages.push(1);
      pages.push("...");
      for (let i = total - 3; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push("...");
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
      pages.push("...");
      pages.push(total);
    }
    return pages;
  };

  const handleViewMRDetails = (mr) => {
    setSelectedMR(mr);
    setShowMRDetails(true);
  };

  const MRDetailsModal = () => {
    if (!showMRDetails || !selectedMR) return null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200">
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
            <div className="mt-2 flex flex-wrap gap-4 text-xs sm:text-sm">
              <span className="text-gray-600">
                <span className="font-medium">Customers:</span>{" "}
                {selectedMR.customers}
              </span>
              <span className="text-gray-600">
                <span className="font-medium">Invoices:</span>{" "}
                {selectedMR.invoiceCount}
              </span>
              <span className="text-gray-600">
                <span className="font-medium">Total Outstanding:</span>{" "}
                <span className="font-medium text-red-600">
                  ${formatCurrency(selectedMR.totalOutstanding)}
                </span>
              </span>
            </div>
          </div>
          <div className="p-4 sm:p-6 overflow-auto max-h-[calc(90vh-120px)]">
            <table className="min-w-full divide-y divide-gray-200 text-center">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 sm:px-4 py-2 text-xs font-medium text-gray-500">
                    Customer
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-xs font-medium text-gray-500">
                    Due Date
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-xs font-medium text-gray-500">
                    Days Overdue
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-xs font-medium text-gray-500">
                    Total Outstanding
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-xs font-medium text-gray-500">
                    Invoices
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {selectedMR.customerInvoicesArray.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-900">
                      {c.customerName}
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">
                      {c.earliestDueDate
                        ? formatDateToReadable(c.earliestDueDate)
                        : "N/A"}
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${c.daysOverdue > 90 ? "bg-red-100 text-red-800" : c.daysOverdue > 60 ? "bg-orange-100 text-orange-800" : c.daysOverdue > 30 ? "bg-yellow-100 text-yellow-800" : c.daysOverdue > 0 ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}`}
                      >
                        {c.daysOverdue} {c.daysOverdue === 1 ? "day" : "days"}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium text-red-600">
                      ${formatCurrency(c.totalAmount)}
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">
                      {c.invoiceCount}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td
                    colSpan="2"
                    className="px-2 sm:px-4 py-2 text-right text-xs sm:text-sm font-medium"
                  >
                    Total:
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium">
                    {selectedMR.customerInvoicesArray.length} customers
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium text-red-600">
                    ${formatCurrency(selectedMR.totalOutstanding)}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium">
                    {selectedMR.invoiceCount} invoices
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="p-4 sm:p-6 border-t border-gray-200 flex justify-end">
            <button
              onClick={() => setShowMRDetails(false)}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

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

  const currentTotalRows =
    activeTab === "invoice" ? totalInvoiceCount : mrWiseData.length;
  const currentTotalPages =
    activeTab === "invoice" ? totalInvoicePages : totalMRPages;
  const startIndex = (currentPage - 1) * rowsPerPage + 1;
  const endIndex = Math.min(currentPage * rowsPerPage, currentTotalRows);

  return (
    <>
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Credit Sale Cash Not Received
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                <button
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${activeTab === "invoice" ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
                  onClick={() => setActiveTab("invoice")}
                >
                  Invoice Wise
                </button>
                <button
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${activeTab === "mr" ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
                  onClick={() => setActiveTab("mr")}
                >
                  MR Wise
                </button>
              </div>
              <div className="px-2 py-1 sm:px-3 sm:py-1 bg-blue-100 text-blue-800 text-xs sm:text-sm font-medium rounded-full">
                Total Outstanding:{" "}
                <span className="text-red-600">
                  ${formatCurrency(totalOutstandingAmount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-gray-800">
                {totalInvoiceCount}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">
                Total Invoices
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-red-600">
                ${formatCurrency(totalOutstandingAmount)}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">
                Outstanding Amount
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-blue-600">
                {uniqueMRCount}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">
                Medical Representatives
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-orange-600">
                ${formatCurrency(totalOutstandingAmount / totalInvoiceCount)}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">
                Average per Invoice
              </div>
            </div>
          </div>
        </div>

        {activeTab === "invoice" ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-center min-w-[700px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      Invoice #
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      Date
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      MR Name
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      Customer
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      Total
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      Paid
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      Outstanding
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedInvoiceData.map((invoice, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-gray-900">
                        {invoice.invoiceNumber || "N/A"}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                        {invoice.invoiceDate
                          ? formatDateToReadable(invoice.invoiceDate)
                          : "N/A"}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                        {invoice.mrName || "N/A"}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                        {invoice.customerName || "N/A"}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium">
                        {formatCurrency(invoice.totalAmount || 0)}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-green-600">
                        {formatCurrency(invoice.paidAmount || 0)}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm text-red-600 font-medium">
                        {formatCurrency(invoice.outstandingAmount || 0)}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${invoice.paymentStatus === "Paid" ? "bg-green-100 text-green-800" : invoice.paymentStatus === "Partial Paid" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}
                        >
                          {invoice.paymentStatus || "Credit"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalInvoicePages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="text-xs sm:text-sm text-gray-700">
                  Showing <span className="font-medium">{startIndex}</span> to{" "}
                  <span className="font-medium">{endIndex}</span> of{" "}
                  <span className="font-medium">{currentTotalRows}</span>{" "}
                  invoices
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-1.5 sm:p-2 rounded-md border border-gray-300 bg-white disabled:opacity-40"
                  >
                    <ChevronLeft size={16} className="sm:w-5 sm:h-5" />
                  </button>
                  {getPageNumbers(totalInvoicePages).map((p, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        typeof p === "number" && handlePageChange(p)
                      }
                      disabled={typeof p !== "number"}
                      className={`min-w-[32px] sm:min-w-[36px] h-8 sm:h-9 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium ${p === currentPage ? "bg-blue-600 text-white" : typeof p === "number" ? "bg-white border border-gray-300 hover:bg-gray-100" : "text-gray-500 cursor-default"}`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalInvoicePages}
                    className="p-1.5 sm:p-2 rounded-md border border-gray-300 bg-white disabled:opacity-40"
                  >
                    <ChevronRight size={16} className="sm:w-5 sm:h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-center min-w-[500px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      MR Name
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      Customers
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      Invoices
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      Total Outstanding ($)
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium text-gray-500">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedMRData.map((mr, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-gray-900">
                        {mr.mrName}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                        {mr.customers}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                        {mr.invoiceCount}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-red-600">
                        ${formatCurrency(mr.totalOutstanding)}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3">
                        <button
                          onClick={() => handleViewMRDetails(mr)}
                          className="inline-flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-xs sm:text-sm font-medium"
                        >
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalMRPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="text-xs sm:text-sm text-gray-700">
                  Showing <span className="font-medium">{startIndex}</span> to{" "}
                  <span className="font-medium">{endIndex}</span> of{" "}
                  <span className="font-medium">{currentTotalRows}</span> MRs
                </div>
                <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-1.5 sm:p-2 rounded-md border border-gray-300 bg-white disabled:opacity-40"
                  >
                    <ChevronLeft size={16} className="sm:w-5 sm:h-5" />
                  </button>
                  {getPageNumbers(totalMRPages).map((p, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        typeof p === "number" && handlePageChange(p)
                      }
                      disabled={typeof p !== "number"}
                      className={`min-w-[32px] sm:min-w-[36px] h-8 sm:h-9 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium ${p === currentPage ? "bg-blue-600 text-white" : typeof p === "number" ? "bg-white border border-gray-300 hover:bg-gray-100" : "text-gray-500 cursor-default"}`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalMRPages}
                    className="p-1.5 sm:p-2 rounded-md border border-gray-300 bg-white disabled:opacity-40"
                  >
                    <ChevronRight size={16} className="sm:w-5 sm:h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <MRDetailsModal />
    </>
  );
};
