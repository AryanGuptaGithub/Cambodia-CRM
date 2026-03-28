import React, { useState } from "react";
import { formatCurrency } from "./DashboardUtil";
import { formatDateToReadable } from "../../utils/dateUtil";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";

export const OverdueTable = ({ overdueData, loading }) => {
  const [activeTab, setActiveTab] = useState("invoice");
  const [selectedMR, setSelectedMR] = useState(null);
  const [showMRDetails, setShowMRDetails] = useState(false);
  const [invoiceCurrentPage, setInvoiceCurrentPage] = useState(1);
  const [mrCurrentPage, setMrCurrentPage] = useState(1);
  const rowsPerPage = 5;

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
            {[...Array(5)].map((_, i) => (
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
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Overdue Invoices
        </h3>
        <div className="text-center py-8">
          <p className="text-gray-500">No overdue invoices found</p>
        </div>
      </div>
    );
  }

  // MR-wise grouping
  const mrWiseData = overdueData.reduce((acc, inv) => {
    const mrName = inv.mrName || "Unknown MR";
    const overdue =
      inv.dueAmount > 0
        ? inv.dueAmount
        : Math.max(0, inv.totalAmount - (inv.paidAmount || 0));
    const days = Math.max(
      0,
      Math.floor((new Date() - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24)),
    );
    const cust = inv.customerName || "Unknown";
    if (!acc[mrName])
      acc[mrName] = {
        mrName,
        customers: new Set(),
        customerInvoices: {},
        totalOverdue: 0,
        invoiceCount: 0,
      };
    acc[mrName].customers.add(cust);
    acc[mrName].invoiceCount++;
    acc[mrName].totalOverdue += overdue;
    if (!acc[mrName].customerInvoices[cust])
      acc[mrName].customerInvoices[cust] = {
        customerName: cust,
        totalAmount: 0,
        earliestDueDate: inv.dueDate,
        maxDaysOverdue: days,
        invoiceCount: 0,
      };
    acc[mrName].customerInvoices[cust].totalAmount += overdue;
    acc[mrName].customerInvoices[cust].invoiceCount++;
    if (
      new Date(inv.dueDate) <
      new Date(acc[mrName].customerInvoices[cust].earliestDueDate)
    )
      acc[mrName].customerInvoices[cust].earliestDueDate = inv.dueDate;
    if (days > acc[mrName].customerInvoices[cust].maxDaysOverdue)
      acc[mrName].customerInvoices[cust].maxDaysOverdue = days;
    return acc;
  }, {});
  const mrWiseArray = Object.values(mrWiseData)
    .map((mr) => ({
      ...mr,
      customers: mr.customers.size,
      customerInvoicesArray: Object.values(mr.customerInvoices)
        .map((c) => ({ ...c, daysOverdue: c.maxDaysOverdue }))
        .sort((a, b) => b.totalAmount - a.totalAmount),
    }))
    .sort((a, b) => b.totalOverdue - a.totalOverdue);

  const totalOverdueAmount = overdueData.reduce(
    (sum, inv) =>
      sum +
      (inv.dueAmount > 0
        ? inv.dueAmount
        : Math.max(0, inv.totalAmount - (inv.paidAmount || 0))),
    0,
  );

  // Pagination for invoice
  const invoiceTotalPages = Math.ceil(overdueData.length / rowsPerPage);
  const invoicePaginated = overdueData.slice(
    (invoiceCurrentPage - 1) * rowsPerPage,
    invoiceCurrentPage * rowsPerPage,
  );
  // Pagination for MR
  const mrTotalPages = Math.ceil(mrWiseArray.length / rowsPerPage);
  const mrPaginated = mrWiseArray.slice(
    (mrCurrentPage - 1) * rowsPerPage,
    mrCurrentPage * rowsPerPage,
  );

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
              <h3 className="text-lg font-semibold">
                MR: {selectedMR.mrName} - Customer Overdue Summary
              </h3>
              <button
                onClick={() => setShowMRDetails(false)}
                className="text-gray-400"
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
                <span className="font-medium">Total Overdue:</span>{" "}
                <span className="font-medium text-red-600">
                  ${formatCurrency(selectedMR.totalOverdue)}
                </span>
              </span>
            </div>
          </div>
          <div className="p-4 sm:p-6 overflow-auto max-h-[calc(90vh-120px)]">
            <table className="min-w-full divide-y divide-gray-200 text-center">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 sm:px-4 py-2 text-xs font-medium">
                    Customer
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-xs font-medium">
                    Due Date
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-xs font-medium">
                    Days Overdue
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-xs font-medium">
                    Total Overdue
                  </th>
                  <th className="px-2 sm:px-4 py-2 text-xs font-medium">
                    Invoices
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {selectedMR.customerInvoicesArray.map((c, i) => (
                  <tr key={i}>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium">
                      {c.customerName}
                    </td>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">
                      {formatDateToReadable(c.earliestDueDate)}
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
                    ${formatCurrency(selectedMR.totalOverdue)}
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
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  const Pagination = ({
    currentPage,
    totalPages,
    onPageChange,
    dataType,
    totalItems,
  }) => {
    if (totalPages <= 1) return null;
    const start = (currentPage - 1) * rowsPerPage + 1;
    const end = Math.min(currentPage * rowsPerPage, totalItems);
    const getPages = () => {
      const pages = [];
      const max = 5;
      if (totalPages <= max)
        for (let i = 1; i <= totalPages; i++) pages.push(i);
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
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="text-xs sm:text-sm text-gray-700">
          Showing <span className="font-medium">{start}</span> to{" "}
          <span className="font-medium">{end}</span> of{" "}
          <span className="font-medium">{totalItems}</span>{" "}
          {dataType === "invoice" ? "invoices" : "MRs"}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1.5 sm:p-2 rounded-md border border-gray-300 bg-white disabled:opacity-40"
          >
            <ChevronLeft size={16} className="sm:w-5 sm:h-5" />
          </button>
          {getPages().map((p, i) => (
            <button
              key={i}
              onClick={() => typeof p === "number" && onPageChange(p)}
              disabled={typeof p !== "number"}
              className={`min-w-[32px] sm:min-w-[36px] h-8 sm:h-9 px-2 sm:px-3 rounded-md text-xs sm:text-sm font-medium ${p === currentPage ? "bg-blue-600 text-white" : typeof p === "number" ? "bg-white border border-gray-300 hover:bg-gray-100" : "text-gray-500 cursor-default"}`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-1.5 sm:p-2 rounded-md border border-gray-300 bg-white disabled:opacity-40"
          >
            <ChevronRight size={16} className="sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-md border border-gray-200">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Overdue Invoices
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                <button
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium ${activeTab === "invoice" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}
                  onClick={() => handleTabChange("invoice")}
                >
                  Invoice Wise
                </button>
                <button
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium ${activeTab === "mr" ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"}`}
                  onClick={() => handleTabChange("mr")}
                >
                  MR Wise
                </button>
              </div>
              <div className="text-xs sm:text-sm font-medium text-red-600">
                Total Overdue: ${formatCurrency(totalOverdueAmount)}
              </div>
            </div>
          </div>

          {activeTab === "invoice" ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-center min-w-[800px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        Invoice No
                      </th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        Invoice Date
                      </th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        MR Name
                      </th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        Customer
                      </th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        Due Date
                      </th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        Days Overdue
                      </th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        Overdue Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoicePaginated.map((inv) => {
                      const days = Math.max(
                        0,
                        Math.floor(
                          (new Date() - new Date(inv.dueDate)) /
                            (1000 * 60 * 60 * 24),
                        ),
                      );
                      const amount =
                        inv.dueAmount > 0
                          ? inv.dueAmount
                          : Math.max(
                              0,
                              inv.totalAmount - (inv.paidAmount || 0),
                            );
                      return (
                        <tr key={inv._id}>
                          <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium">
                            {inv.invoiceNumber || "N/A"}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                            {formatDateToReadable(inv.invoiceDate)}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                            {inv.mrName || "N/A"}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                            {inv.customerName || "N/A"}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                            {new Date(inv.dueDate).toLocaleDateString()}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-full ${days > 90 ? "bg-red-100 text-red-800" : days > 60 ? "bg-orange-100 text-orange-800" : days > 30 ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800"}`}
                            >
                              {days} days
                            </span>
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-red-600">
                            ${formatCurrency(amount)}
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
                totalItems={overdueData.length}
              />
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-center min-w-[500px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        MR Name
                      </th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        Customers
                      </th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        Invoices
                      </th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        Total Overdue ($)
                      </th>
                      <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs font-medium">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {mrPaginated.map((mr, idx) => (
                      <tr key={idx}>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium">
                          {mr.mrName}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                          {mr.customers}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                          {mr.invoiceCount}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-red-600">
                          ${formatCurrency(mr.totalOverdue)}
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
              <Pagination
                currentPage={mrCurrentPage}
                totalPages={mrTotalPages}
                onPageChange={setMrCurrentPage}
                dataType="mr"
                totalItems={mrWiseArray.length}
              />
            </>
          )}
        </div>
      </div>
      <MRDetailsModal />
    </>
  );
};
