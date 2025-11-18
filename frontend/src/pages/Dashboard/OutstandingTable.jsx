import React from "react";
import { Download, Eye } from "lucide-react";
import { formatCurrency } from "./DashboardUtil";
import {DataTable} from "./DataTable";

export const OutstandingTable = ({
  outstandingTableData,
  loadingOutstandingData,
  activeOutstandingSubTab,
  dateRanges,
  onViewInvoices
}) => {
  const groupedOutstandingData = React.useMemo(() => {
    const mrGroups = {};
    outstandingTableData.forEach((outstanding) => {
      if (!mrGroups[outstanding.mrName]) {
        mrGroups[outstanding.mrName] = {
          mrName: outstanding.mrName,
          totalOutstanding: 0,
          invoices: [],
          customerCount: 0,
          customers: new Set(),
        };
      }
      mrGroups[outstanding.mrName].totalOutstanding += outstanding.dueAmount;
      mrGroups[outstanding.mrName].invoices.push(outstanding);
      mrGroups[outstanding.mrName].customerCount += 1;
      if (outstanding.customerName) {
        mrGroups[outstanding.mrName].customers.add(outstanding.customerName);
      }
    });

    Object.values(mrGroups).forEach((mr) => {
      mr.customerCount = mr.customers.size;
    });

    return Object.values(mrGroups);
  }, [outstandingTableData]);

  const getTableTitle = () => {
    switch (activeOutstandingSubTab) {
      case "Today": return `Outstanding Details - ${dateRanges.today.label}`;
      case "Month": return `Outstanding Details - ${dateRanges.month.label}`;
      case "Year": return `Outstanding Details - ${dateRanges.year.rangeLabel}`;
      default: return `Outstanding Details - ${activeOutstandingSubTab}`;
    }
  };

  return (
    <DataTable
      title={getTableTitle()}
      loading={loadingOutstandingData}
      loadingText="Loading outstanding data..."
      emptyText={`No outstanding data found for ${activeOutstandingSubTab}`}
      columns={[
        { header: "MR Name", accessor: "mrName", className: "capitalize" },
        { 
          header: "Customers", 
          render: (row) => 
            row.customerCount === 1 
              ? Array.from(row.customers)[0]
              : <span>{row.customerCount} customers</span>
        },
        { 
          header: "Invoices", 
          render: (row) => 
            row.invoices.length === 1 
              ? row.invoices[0].invoiceNumber
              : <span>{row.invoices.length} invoices</span>
        },
        { 
          header: "Total Outstanding ($)", 
          render: (row) => 
            <span className="text-orange-600 font-semibold">
              ${formatCurrency(row.totalOutstanding)}
            </span>
        },
        {
          header: "Actions",
          render: (row) => (
            <button
              onClick={() => onViewInvoices(row.mrName, row.invoices)}
              className="text-gray-400 hover:text-orange-600 transition-colors cursor-pointer p-2"
              title="View All Invoices"
            >
              <Eye className="w-5 h-5" />
            </button>
          )
        }
      ]}
      data={groupedOutstandingData}
    />
  );
};