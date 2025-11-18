import React from "react";
import { Download, ShoppingCart } from "lucide-react";
import { formatCurrency } from "./DashboardUtil";
import { DataTable } from "./DataTable";

export const SalesTable = ({
  salesTableData,
  loadingSalesData,
  activeSalesSubTab,
  dateRanges,
  onViewProducts,
}) => {
  const groupedSalesData = React.useMemo(() => {
    const mrGroups = {};
    salesTableData.forEach((sale) => {
      if (!mrGroups[sale.salesPerson]) {
        mrGroups[sale.salesPerson] = {
          mrName: sale.salesPerson,
          totalAmount: 0,
          products: [],
          productCount: 0,
          customers: new Set(),
        };
      }
      mrGroups[sale.salesPerson].totalAmount += sale.amount;
      mrGroups[sale.salesPerson].products.push(sale);
      mrGroups[sale.salesPerson].productCount += 1;
      if (sale.customer && sale.customer !== "N/A") {
        mrGroups[sale.salesPerson].customers.add(sale.customer);
      }
    });

    Object.values(mrGroups).forEach((mr) => {
      mr.customerCount = mr.customers.size;
    });

    return Object.values(mrGroups);
  }, [salesTableData]);

  const getTableTitle = () => {
    switch (activeSalesSubTab) {
      case "Today":
        return `Sales Details - ${dateRanges.today.label}`;
      case "Month":
        return `Sales Details - ${dateRanges.month.label}`;
      case "Year":
        return `Sales Details - ${dateRanges.year.rangeLabel}`;
      default:
        return `Sales Details - ${activeSalesSubTab}`;
    }
  };

  return (
    <DataTable
      title={getTableTitle()}
      loading={loadingSalesData}
      loadingText="Loading sales data..."
      emptyText={`No sales data found for ${activeSalesSubTab}`}
      columns={[
        { header: "MR Name", accessor: "mrName", className: "capitalize" },
        {
          header: "Products",
          render: (row) =>
            row.productCount === 1 ? (
              row.products[0].productName
            ) : (
              <span>{row.productCount} Products</span>
            ),
        },
        {
          header: "Customer",
          render: (row) =>
            row.customerCount === 1 ? (
              Array.from(row.customers)[0]
            ) : (
              <span>{row.customerCount} customers</span>
            ),
        },
        {
          header: "Total Amount ($)",
          render: (row) => (
            <span className="text-green-600 font-semibold">
              ${formatCurrency(row.totalAmount)}
            </span>
          ),
        },
        {
          header: "Actions",
          render: (row) => (
            <button
              onClick={() => onViewProducts(row.mrName, row.products)}
              className="text-gray-400 hover:text-blue-600 transition-colors cursor-pointer p-2"
              title="View All Products"
            >
              <ShoppingCart size={20} />
            </button>
          ),
        },
      ]}
      data={groupedSalesData}
    />
  );
};
