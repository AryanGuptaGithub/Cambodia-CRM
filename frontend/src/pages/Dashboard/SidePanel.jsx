import React from "react";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  Receipt,
  Calendar,
  Eye,
  ShoppingCart,
  AlertCircle,
  DollarSign,
  Clock,
  Calendar as CalendarIcon,
  Filter,
  CreditCard,
} from "lucide-react";
import { formatCurrency } from "./DashboardUtil";
import { formatDateToReadable } from "../../utils/dateUtil";

const PanelContent = ({
  data,
  loading,
  loadingText,
  emptyText,
  renderItem,
  pagination,
}) => {
  if (loading) {
    return <p className="text-gray-500 text-center py-4">{loadingText}</p>;
  }

  if (!data || data.length === 0) {
    return <p className="text-gray-500 text-center py-4">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((item, index) => (
        <React.Fragment
          key={
            item._id ||
            item.id ||
            item.mrName ||
            item.product ||
            item.category?.category ||
            item.category ||
            `${index}-${Math.random()}`
          }
        >
          {renderItem(item, index)}
        </React.Fragment>
      ))}

      {pagination?.show && (
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
            disabled={pagination.currentPage === 1}
            className="px-3 py-1 text-sm bg-gray-200 rounded disabled:opacity-50 cursor-pointer"
          >
            Previous
          </button>

          <span className="text-sm text-gray-600">
            Page {pagination.currentPage} of {pagination.totalPages}
          </span>

          <button
            onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
            disabled={pagination.currentPage === pagination.totalPages}
            className="px-3 py-1 text-sm bg-gray-200 rounded disabled:opacity-50 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

/* --------------------------------------------
   RecentSales Component
--------------------------------------------- */
const RecentSales = ({
  salesTableData = [],
  loadingSalesData = false,
  onViewProducts,
  showAllMRsInSidePanel = false,
  sidePanelCurrentPage = 1,
  sidePanelPerPage = 10,
  onPageChange,
}) => {
  const mrWiseSales = React.useMemo(() => {
    const mrSales = {};
    salesTableData.forEach((sale) => {
      if (!mrSales[sale.salesPerson]) {
        mrSales[sale.salesPerson] = {
          mrName: sale.salesPerson,
          totalAmount: 0,
          productCount: 0,
          products: [],
        };
      }
      mrSales[sale.salesPerson].totalAmount += sale.amount;
      mrSales[sale.salesPerson].productCount += 1;
      mrSales[sale.salesPerson].products.push(sale);
    });
    return Object.values(mrSales).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [salesTableData]);

  const totalPages = Math.ceil(mrWiseSales.length / sidePanelPerPage);

  const currentMRs = showAllMRsInSidePanel
    ? mrWiseSales.slice(
        (sidePanelCurrentPage - 1) * sidePanelPerPage,
        sidePanelCurrentPage * sidePanelPerPage
      )
    : mrWiseSales.slice(0, 5);

  return (
    <PanelContent
      data={currentMRs}
      loading={loadingSalesData}
      loadingText="Loading..."
      emptyText="No sales data found"
      renderItem={(mrSale, index) => (
        <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-semibold">
              {showAllMRsInSidePanel
                ? (sidePanelCurrentPage - 1) * sidePanelPerPage + index + 1
                : index + 1}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-800">
                {mrSale.mrName}
              </p>
              <p className="text-xs text-gray-500">
                {mrSale.productCount} product
                {mrSale.productCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="text-right flex items-center gap-2">
            <p className="text-sm font-semibold text-green-600">
              ${formatCurrency(mrSale.totalAmount)}
            </p>

            <button
              onClick={() => onViewProducts(mrSale.mrName, mrSale.products)}
              className="text-gray-400 hover:text-blue-600 transition-colors cursor-pointer p-1"
              title="View Products"
            >
              <ShoppingCart size={16} />
            </button>
          </div>
        </div>
      )}
      pagination={{
        show: showAllMRsInSidePanel && totalPages > 1,
        currentPage: sidePanelCurrentPage,
        totalPages,
        onPageChange,
      }}
    />
  );
};

/* --------------------------------------------
   RecentOutstanding Component
--------------------------------------------- */
const RecentOutstanding = ({
  outstandingTableData = [],
  loadingOutstandingData = false,
  onViewInvoices,
  showAllMRsInSidePanel = false,
  sidePanelCurrentPage = 1,
  sidePanelPerPage = 10,
  onPageChange,
}) => {
  const mrWiseOutstanding = React.useMemo(() => {
    const mrOutstanding = {};
    outstandingTableData.forEach((out) => {
      if (!mrOutstanding[out.mrName]) {
        mrOutstanding[out.mrName] = {
          mrName: out.mrName,
          totalOutstanding: 0,
          invoices: [],
          customerCount: 0,
        };
      }
      mrOutstanding[out.mrName].totalOutstanding += out.dueAmount;
      mrOutstanding[out.mrName].invoices.push(out);
      mrOutstanding[out.mrName].customerCount += 1;
    });

    return Object.values(mrOutstanding).sort(
      (a, b) => b.totalOutstanding - a.totalOutstanding
    );
  }, [outstandingTableData]);

  const totalPages = Math.ceil(mrWiseOutstanding.length / sidePanelPerPage);

  const currentOutstanding = showAllMRsInSidePanel
    ? mrWiseOutstanding.slice(
        (sidePanelCurrentPage - 1) * sidePanelPerPage,
        sidePanelCurrentPage * sidePanelPerPage
      )
    : mrWiseOutstanding.slice(0, 5);

  return (
    <PanelContent
      data={currentOutstanding}
      loading={loadingOutstandingData}
      loadingText="Loading..."
      emptyText="No outstanding data found"
      renderItem={(mrOutstanding, index) => (
        <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-semibold">
              {showAllMRsInSidePanel
                ? (sidePanelCurrentPage - 1) * sidePanelPerPage + index + 1
                : index + 1}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-800 capitalize">
                {mrOutstanding.mrName}
              </p>
              <p className="text-xs text-gray-500">
                {mrOutstanding.customerCount} customer
                {mrOutstanding.customerCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="text-right flex items-center gap-2">
            <p className="text-sm font-semibold text-orange-600">
              ${formatCurrency(mrOutstanding.totalOutstanding)}
            </p>

            <button
              onClick={() =>
                onViewInvoices(mrOutstanding.mrName, mrOutstanding.invoices)
              }
              className="text-gray-400 hover:text-orange-600 transition-colors cursor-pointer p-1"
              title="View Invoices"
            >
              <Eye size={16} />
            </button>
          </div>
        </div>
      )}
      pagination={{
        show: showAllMRsInSidePanel && totalPages > 1,
        currentPage: sidePanelCurrentPage,
        totalPages,
        onPageChange,
      }}
    />
  );
};

/* --------------------------------------------
   RecentExpenses Component
--------------------------------------------- */
const RecentExpenses = ({
  expenseTableData = [],
  loadingExpenseData = false,
}) => {
  const highestExpense = React.useMemo(() => {
    if (!expenseTableData || expenseTableData.length === 0) {
      return null;
    }
    return expenseTableData.reduce(
      (max, expense) => (expense.amount > max.amount ? expense : max),
      expenseTableData[0]
    );
  }, [expenseTableData]);

  const topExpenses = React.useMemo(() => {
    if (!expenseTableData) return [];
    return expenseTableData.slice(0, 5);
  }, [expenseTableData]);

  if (loadingExpenseData) {
    return (
      <p className="text-gray-500 text-center py-4">Loading expenses...</p>
    );
  }

  return (
    <div className="space-y-3">
      {highestExpense && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 text-sm font-semibold">
                <TrendingUp size={14} />
              </div>
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  Highest Expense
                </p>
                <p className="text-xs text-yellow-600">
                  {highestExpense.category || "Uncategorized"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-yellow-700">
                ${formatCurrency(highestExpense.amount)}
              </p>
              <p className="text-xs text-yellow-600">
                {highestExpense.date || "No date"}
              </p>
            </div>
          </div>
        </div>
      )}

      <PanelContent
        data={topExpenses}
        loading={false}
        emptyText="No expense data available for current period"
        renderItem={(item, index) => (
          <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-semibold">
                {index + 1}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {item.category || "Uncategorized"}
                </p>
                <p className="text-xs text-gray-500">
                  {item.description || "No description"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-red-700">
                ${formatCurrency(item.amount)}
              </p>
              <p className="text-xs text-gray-500">{item.date || "No date"}</p>
            </div>
          </div>
        )}
      />
    </div>
  );
};

/* --------------------------------------------
   RecentOverdue Component
--------------------------------------------- */
const RecentOverdue = ({
  overdueTableData = [],
  loadingOverdueData = false,
}) => {
  // Get top 5 overdue invoices by amount
  const topOverdueInvoices = React.useMemo(() => {
    if (!overdueTableData || overdueTableData.length === 0) {
      return [];
    }

    // Sort by overdue amount in descending order and take top 5
    return [...overdueTableData]
      .sort((a, b) => {
        const amountA =
          a.overdueAmount ||
          (a.dueAmount > 0
            ? a.dueAmount
            : Math.max(0, a.totalAmount - (a.paidAmount || 0)));
        const amountB =
          b.overdueAmount ||
          (b.dueAmount > 0
            ? b.dueAmount
            : Math.max(0, b.totalAmount - (b.paidAmount || 0)));
        return amountB - amountA;
      })
      .slice(0, 5);
  }, [overdueTableData]);

  // Calculate total overdue amount
  const totalOverdueAmount = React.useMemo(() => {
    if (!overdueTableData || overdueTableData.length === 0) {
      return 0;
    }

    return overdueTableData.reduce((sum, invoice) => {
      const overdueAmount =
        invoice.overdueAmount ||
        (invoice.dueAmount > 0
          ? invoice.dueAmount
          : Math.max(0, invoice.totalAmount - (invoice.paidAmount || 0)));
      return sum + overdueAmount;
    }, 0);
  }, [overdueTableData]);

  if (loadingOverdueData) {
    return (
      <p className="text-gray-500 text-center py-4">
        Loading overdue invoices...
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Total Overdue Highlight */}
      {totalOverdueAmount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-semibold">
                <AlertCircle size={14} />
              </div>
              <div>
                <p className="text-sm font-medium text-red-800">
                  Total Overdue
                </p>
                <p className="text-xs text-red-600">
                  {overdueTableData?.length || 0} invoice
                  {overdueTableData?.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-red-700">
                ${formatCurrency(totalOverdueAmount)}
              </p>
              <p className="text-xs text-red-600">Highest priority</p>
            </div>
          </div>
        </div>
      )}

      {/* Top 5 Overdue Invoices */}
      <PanelContent
        data={topOverdueInvoices}
        loading={false}
        emptyText="No overdue invoices found"
        renderItem={(item, index) => {
          const dueDate = new Date(item.dueDate);
          const today = new Date();
          const daysOverdue = Math.max(
            0,
            Math.floor((today - dueDate) / (1000 * 60 * 60 * 24))
          );

          const overdueAmount =
            item.overdueAmount ||
            (item.dueAmount > 0
              ? item.dueAmount
              : Math.max(0, item.totalAmount - (item.paidAmount || 0)));

          return (
            <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-semibold">
                  {index + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {item.customerName || "No customer"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.invoiceNumber || "No invoice#"} •{" "}
                    {item.mrName || "No MR"}
                  </p>
                  <span
                    className={`inline-block px-2 py-0.5 mt-1 text-xs rounded-full ${
                      daysOverdue > 90
                        ? "bg-red-100 text-red-800"
                        : daysOverdue > 60
                        ? "bg-orange-100 text-orange-800"
                        : daysOverdue > 30
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {daysOverdue} days overdue
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-red-700">
                  ${formatCurrency(overdueAmount)}
                </p>
                <p className="text-xs text-gray-500">
                  Due: {formatDateToReadable(item.dueDate)}
                </p>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
};

/* --------------------------------------------
   Low Stock
--------------------------------------------- */
const LowStock = ({ stockData = {} }) => (
  <PanelContent
    data={stockData.lowStockItems?.slice(0, 5) || []}
    loading={false}
    emptyText="No low stock items"
    renderItem={(item) => (
      <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-semibold">
            <AlertTriangle size={14} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">
              {item.productName}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold text-red-700">
            {item.quantity?.boxes}
          </p>
          <p className="text-xs text-gray-500">Min: {item.minStockLevel}</p>
        </div>
      </div>
    )}
  />
);

/* --------------------------------------------
   Recent Joins
--------------------------------------------- */
const RecentJoins = ({ mrList = [] }) => {
  const recentMRs = React.useMemo(() => {
    return mrList
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
  }, [mrList]);

  return (
    <PanelContent
      data={recentMRs}
      loading={false}
      emptyText="No recent activity"
      renderItem={(mr) => (
        <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold">
              {mr.medicalRepName?.substring(0, 2).toUpperCase() || "MR"}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-800 capitalize">
                {mr.medicalRepName}
              </p>
              <p className="text-xs text-gray-500">{mr.teamName}</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs text-gray-500">
              {formatDateToReadable(mr.date)}
            </p>

            <span
              className={`inline-block px-2 py-1 rounded-full text-xs ${
                mr.enabled
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {mr.enabled ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      )}
    />
  );
};

const RecentActivityPendingCollection = ({
  pendingCollectionData = [],
  loadingPendingCollectionData = false,
}) => {
  // Moved ALL hooks to the top, before any conditional returns
  const todayPendingCollections = React.useMemo(() => {
    // If data is undefined or null, return empty array
    if (!pendingCollectionData || pendingCollectionData.length === 0) {
      return [];
    }

    // Filter to show only invoices with due date TODAY
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0]; // Get YYYY-MM-DD format

    return pendingCollectionData.filter((invoice) => {
      if (!invoice.dueDate) return false;

      const invoiceDueDate = new Date(invoice.dueDate);
      const invoiceDueDateStr = invoiceDueDate.toISOString().split("T")[0];

      // Check if due date is exactly today
      return invoiceDueDateStr === todayStr;
    });
  }, [pendingCollectionData]);

  // Calculate totals
  const calculateTotals = React.useMemo(() => {
    if (!todayPendingCollections || todayPendingCollections.length === 0) {
      return {
        totalAmount: 0,
        totalOutstanding: 0,
        totalPaid: 0,
        invoicesByStatus: {},
      };
    }

    let totalAmount = 0;
    let totalOutstanding = 0;
    let totalPaid = 0;
    const invoicesByStatus = {};

    todayPendingCollections.forEach((invoice) => {
      // Use outstandingAmount from API response if available, otherwise calculate
      const outstanding =
        invoice.outstandingAmount ||
        invoice.dueAmount ||
        invoice.totalAmount - (invoice.paidAmount || 0);

      totalAmount += invoice.totalAmount || 0;
      totalOutstanding += outstanding;
      totalPaid += invoice.paidAmount || 0;

      const status = invoice.paymentStatus || "Unknown";
      invoicesByStatus[status] = (invoicesByStatus[status] || 0) + 1;
    });

    return {
      totalAmount,
      totalOutstanding,
      totalPaid,
      invoicesByStatus,
    };
  }, [todayPendingCollections]);

  const totals = calculateTotals;

  // Get top 5 by outstanding amount
  const topCollections = React.useMemo(() => {
    if (!todayPendingCollections || todayPendingCollections.length === 0) {
      return [];
    }

    return [...todayPendingCollections]
      .sort((a, b) => {
        const outstandingA =
          a.outstandingAmount ||
          a.dueAmount ||
          a.totalAmount - (a.paidAmount || 0);
        const outstandingB =
          b.outstandingAmount ||
          b.dueAmount ||
          b.totalAmount - (b.paidAmount || 0);
        return outstandingB - outstandingA;
      })
      .slice(0, 5);
  }, [todayPendingCollections]);

  // Get today's date for display
  const today = new Date();
  const todayString = today.toLocaleDateString();

  // Only AFTER all hooks are declared, we can have conditional returns
  if (loadingPendingCollectionData) {
    return (
      <p className="text-gray-500 text-center py-4">
        Loading today's pending collections...
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {/* Total Outstanding for Today */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                <DollarSign size={12} className="text-red-600" />
              </div>
              <span className="text-xs font-medium text-red-800">
                Due Today
              </span>
            </div>
            <p className="text-sm font-bold text-red-700">
              ${formatCurrency(totals.totalOutstanding)}
            </p>
          </div>
          <p className="text-xs text-red-600 mt-1">
            {todayPendingCollections.length} invoice
            {todayPendingCollections.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Total Invoices for Today */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                <CreditCard size={12} className="text-blue-600" />
              </div>
              <span className="text-xs font-medium text-blue-800">
                Total Amount
              </span>
            </div>
            <p className="text-sm font-bold text-blue-700">
              ${formatCurrency(totals.totalAmount)}
            </p>
          </div>
          <p className="text-xs text-blue-600 mt-1">
            Paid: ${formatCurrency(totals.totalPaid)}
          </p>
        </div>
      </div>

      {/* Status Summary for Today */}
      {Object.keys(totals.invoicesByStatus).length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600">
                <Filter size={14} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  Payment Status
                </p>
                <p className="text-xs text-gray-600">Today's due collections</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {Object.entries(totals.invoicesByStatus).map(([status, count]) => (
              <span
                key={status}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
              >
                {status}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      <PanelContent
        data={topCollections}
        loading={false}
        emptyText="No pending collections found for today"
        renderItem={(item, index) => {
          const outstandingAmount =
            item.outstandingAmount ||
            item.dueAmount ||
            item.totalAmount - (item.paidAmount || 0);

          // Format due date
          const dueDate = item.dueDate ? new Date(item.dueDate) : null;
          const isDueToday = dueDate
            ? dueDate.toISOString().split("T")[0] ===
              new Date().toISOString().split("T")[0]
            : false;

          // Determine color based on payment status
          let statusColor = "";
          let statusBgColor = "";

          const paymentStatus = item.paymentStatus?.toLowerCase() || "";

          switch (paymentStatus) {
            case "credit":
              statusColor = "text-red-800";
              statusBgColor = "bg-red-100";
              break;
            case "partial":
              statusColor = "text-yellow-800";
              statusBgColor = "bg-yellow-100";
              break;
            case "pending":
              statusColor = "text-orange-800";
              statusBgColor = "bg-orange-100";
              break;
            default:
              statusColor = "text-gray-800";
              statusBgColor = "bg-gray-100";
          }

          return (
            <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-semibold">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {item.customerName || "No customer"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {item.invoiceNumber || "No invoice#"} •{" "}
                    {item.mrName || "No MR"}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full ${statusBgColor} ${statusColor}`}
                    >
                      {item.paymentStatus || "Unknown"}
                    </span>
                    <span
                      className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                        isDueToday
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {isDueToday
                        ? "Due: Today"
                        : dueDate
                        ? `Due: ${dueDate.toLocaleDateString()}`
                        : "No due date"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right pl-2">
                <p className="text-sm font-semibold text-red-700 whitespace-nowrap">
                  ${formatCurrency(outstandingAmount)}
                </p>
                <p className="text-xs text-gray-500 whitespace-nowrap">
                  Total: ${formatCurrency(item.totalAmount || 0)}
                </p>
                <p className="text-xs text-green-600 whitespace-nowrap">
                  Paid: ${formatCurrency(item.paidAmount || 0)}
                </p>
              </div>
            </div>
          );
        }}
      />

      {todayPendingCollections.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-left">
              <p className="text-xs text-gray-500">
                Showing top {Math.min(5, todayPendingCollections.length)} of{" "}
                {todayPendingCollections.length}
              </p>
              <p className="text-xs text-gray-400">
                Due date: {formatDateToReadable(new Date())}{" "}
                {/* Fixed this line */}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-gray-900">
                Total due:{" "}
                <span className="text-red-600">
                  ${formatCurrency(totals.totalOutstanding)}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                from {todayPendingCollections.length} invoice
                {todayPendingCollections.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
/* --------------------------------------------
   Main SidePanel Export - Updated
--------------------------------------------- */
/* --------------------------------------------
   Main SidePanel Export - Updated
--------------------------------------------- */
export const SidePanel = ({
  activeTab,
  showAllMRsInSidePanel = false,
  onPanelIconClick,
  sidePanelCurrentPage = 1,
  onSidePanelPageChange,
  salesTableData = [],
  loadingSalesData = false,
  outstandingTableData = [],
  loadingOutstandingData = false,
  expenseTableData = [],
  loadingExpenseData = false,
  stockData = {},
  expenseData = {},
  mrList = [],
  onViewProducts,
  onViewInvoices,
  onViewExpenseDetails,
  overdueTableData = [],
  loadingOverdueData = false,
  pendingCollectionData = [], // Default to empty array
  loadingPendingCollectionData = false, // Default to false
  creditSaleTableData = [], // ADD THIS: Credit sale data prop
  loadingCreditSaleData = false, // ADD THIS: Credit sale loading prop
}) => {
  const getPanelConfig = () => {
    const configs = {
      Sales: {
        title: showAllMRsInSidePanel ? "All MRs Sales" : "Highest Sales by MR",
        icon: Users,
        content: (
          <RecentSales
            salesTableData={salesTableData}
            loadingSalesData={loadingSalesData}
            onViewProducts={onViewProducts}
            showAllMRsInSidePanel={showAllMRsInSidePanel}
            sidePanelCurrentPage={sidePanelCurrentPage}
            sidePanelPerPage={10}
            onPageChange={onSidePanelPageChange}
          />
        ),
      },

      Outstanding: {
        title: showAllMRsInSidePanel
          ? "All Outstanding"
          : "Highest Outstanding by MR",
        icon: TrendingUp,
        content: (
          <RecentOutstanding
            outstandingTableData={outstandingTableData}
            loadingOutstandingData={loadingOutstandingData}
            onViewInvoices={onViewInvoices}
            showAllMRsInSidePanel={showAllMRsInSidePanel}
            sidePanelCurrentPage={sidePanelCurrentPage}
            sidePanelPerPage={10}
            onPageChange={onSidePanelPageChange}
          />
        ),
      },

      "Pending Collection": {
        title: "Today's Pending Collections",
        icon: Clock,
        content: (
          <RecentActivityPendingCollection
            pendingCollectionData={pendingCollectionData}
            loadingPendingCollectionData={loadingPendingCollectionData}
          />
        ),
      },

      "Stock in Hands": {
        title: "Low Stock Items",
        icon: AlertTriangle,
        content: <LowStock stockData={stockData} />,
      },

      Expenses: {
        title: "Latest Expenses",
        icon: Receipt,
        content: (
          <RecentExpenses
            expenseTableData={expenseTableData}
            loadingExpenseData={loadingExpenseData}
          />
        ),
      },

      "Total Payroll": {
        title: "Recent Joins",
        icon: Calendar,
        content: <RecentJoins mrList={mrList} />,
      },

      Overdue: {
        title: "Highest Overdue Amount",
        icon: AlertCircle,
        content: (
          <RecentOverdue
            overdueTableData={overdueTableData}
            loadingOverdueData={loadingOverdueData}
          />
        ),
      },

      "Credit Sale Cash Not Receive": {
        title: "Credit Sales (Cash Not Received)",
        icon: CreditCard,
        content: (
          <RecentActivityPendingCollection
            pendingCollectionData={creditSaleTableData || []} // Use creditSaleTableData here
            loadingPendingCollectionData={loadingCreditSaleData || false}
          />
        ),
      },
    };

    return (
      configs[activeTab] || {
        title: "Recent Activity",
        icon: Calendar,
        content: (
          <div className="text-center py-8">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No data available for this tab</p>
          </div>
        ),
      }
    );
  };

  const { title, icon: Icon, content } = getPanelConfig();

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>

        <button
          onClick={onPanelIconClick}
          className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          title={
            activeTab === "Sales" || activeTab === "Outstanding"
              ? showAllMRsInSidePanel
                ? "Show Top 5"
                : "Show All"
              : activeTab === "Pending Collection"
              ? "View All Collections"
              : activeTab === "Total Payroll"
              ? "View All MRs"
              : activeTab === "Overdue"
              ? "View Details"
              : "View Details"
          }
        >
          {activeTab === "Sales" || activeTab === "Outstanding" ? (
            <Users className="w-5 h-5" />
          ) : activeTab === "Pending Collection" ? (
            <Clock className="w-5 h-5" />
          ) : (
            <Icon className="w-5 h-5" />
          )}
        </button>
      </div>

      {content}
    </div>
  );
};
