import React from "react";
import { Users, TrendingUp, AlertTriangle, Receipt, Calendar, Eye, ShoppingCart } from "lucide-react";
import { formatCurrency } from "./DashboardUtil";
import { formatDateToReadable } from "../../utils/dateUtil";

/* --------------------------------------------
   Reusable PanelContent Component (FIXED KEYS)
--------------------------------------------- */
const PanelContent = ({ data, loading, loadingText, emptyText, renderItem, pagination }) => {
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
            item.id ||
            item.mrName ||
            item.product ||
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
  salesTableData,
  loadingSalesData,
  onViewProducts,
  showAllMRsInSidePanel,
  sidePanelCurrentPage,
  sidePanelPerPage,
  onPageChange
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
              <p className="text-sm font-medium text-gray-800">{mrSale.mrName}</p>
              <p className="text-xs text-gray-500">
                {mrSale.productCount} product{mrSale.productCount !== 1 ? "s" : ""}
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
  outstandingTableData,
  loadingOutstandingData,
  onViewInvoices,
  showAllMRsInSidePanel,
  sidePanelCurrentPage,
  sidePanelPerPage,
  onPageChange
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
              onClick={() => onViewInvoices(mrOutstanding.mrName, mrOutstanding.invoices)}
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
   Low Stock
--------------------------------------------- */
const LowStock = ({ stockData }) => (
  <PanelContent
    data={stockData.lowStockItems?.slice(0, 5)}
    loading={false}
    emptyText="No low stock items"
    renderItem={(item) => (
      <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-semibold">
            <AlertTriangle size={14} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">{item.product}</p>
            <p className="text-xs text-gray-500">{item.category}</p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold text-red-700">{item.currentStock}</p>
          <p className="text-xs text-gray-500">Min: {item.minLevel}</p>
        </div>
      </div>
    )}
  />
);

/* --------------------------------------------
   Recent Expenses
--------------------------------------------- */
const RecentExpenses = ({ expenseData }) => (
  <PanelContent
    data={expenseData.latestExpenses?.slice(0, 5)}
    loading={false}
    emptyText="No recent expenses"
    renderItem={(item) => (
      <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-semibold">
            {item.category?.substring(0, 2).toUpperCase() || "EX"}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-800">{item.category}</p>
            <p className="text-xs text-gray-500">{item.description}</p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold text-red-700">
            ${formatCurrency(item.amount)}
          </p>
          <p className="text-xs text-gray-500">{item.date}</p>
        </div>
      </div>
    )}
  />
);

/* --------------------------------------------
   Recent Joins
--------------------------------------------- */
const RecentJoins = ({ mrList }) => {
  const recentMRs = React.useMemo(() => {
    return mrList.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
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
            <p className="text-xs text-gray-500">{formatDateToReadable(mr.date)}</p>

            <span
              className={`inline-block px-2 py-1 rounded-full text-xs ${
                mr.enabled ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
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

/* --------------------------------------------
   Main SidePanel Export
--------------------------------------------- */
export const SidePanel = ({
  activeTab,
  showAllMRsInSidePanel,
  onPanelIconClick,
  sidePanelCurrentPage,
  onSidePanelPageChange,
  salesTableData,
  loadingSalesData,
  outstandingTableData,
  loadingOutstandingData,
  stockData,
  expenseData,
  mrList,
  onViewProducts,
  onViewInvoices,
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
        title: showAllMRsInSidePanel ? "All Outstanding" : "Highest Outstanding by MR",
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

      "Stock in Hands": {
        title: "Low Stock Items",
        icon: AlertTriangle,
        content: <LowStock stockData={stockData} />,
      },

      Expense: {
        title: "Latest Expenses",
        icon: Receipt,
        content: <RecentExpenses expenseData={expenseData} />,
      },

      "Total Payroll": {
        title: "Recent Joins",
        icon: Calendar,
        content: <RecentJoins mrList={mrList} />,
      },
    };

    return configs[activeTab] || {
      title: "Recent Activity",
      icon: Calendar,
      content: null,
    };
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
              : activeTab === "Total Payroll"
              ? "View All MRs"
              : "View Details"
          }
        >
          {activeTab === "Sales" || activeTab === "Outstanding" ? (
            <Users className="w-5 h-5" />
          ) : (
            <Icon className="w-5 h-5" />
          )}
        </button>
      </div>

      {content}
    </div>
  );
};
