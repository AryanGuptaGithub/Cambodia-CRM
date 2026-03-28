import { DataTable } from "./DataTable";
import { formatCurrency } from "./DashboardUtil";

export const PayrollTable = ({
  payrollData,
  loading,
  activePayrollSubTab,
  prevMonthRanges,
}) => {
  const columns = [
    {
      header: "MR Name",
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs sm:text-sm font-semibold">
            {item.employeeId?.medicalRepName
              ? item.employeeId.medicalRepName.substring(0, 2).toUpperCase()
              : "MR"}
          </div>
          <span className="capitalize text-xs sm:text-sm">
            {item.employeeId?.medicalRepName}
          </span>
        </div>
      ),
    },
    { header: "Contact No", accessor: "employeeId.contactNo" },
    { header: "Email", accessor: "employeeId.email" },
    {
      header: "Basic Salary ($)",
      render: (item) => (
        <span className="font-semibold text-blue-700 text-xs sm:text-sm">
          {formatCurrency(item.basicSalary || 0)}
        </span>
      ),
    },
    {
      header: "Allowances ($)",
      render: (item) => (
        <span className="font-semibold text-green-700 text-xs sm:text-sm">
          {formatCurrency(item.totalAllowance || 0)}
        </span>
      ),
    },
    {
      header: "Deductions ($)",
      render: (item) => (
        <span className="font-semibold text-red-700 text-xs sm:text-sm">
          {formatCurrency(item.deductions || 0)}
        </span>
      ),
    },
    {
      header: "Net Salary ($)",
      render: (item) => (
        <span className="font-semibold text-purple-700 text-xs sm:text-sm">
          {formatCurrency(item.netSalary || 0)}
        </span>
      ),
    },
  ];

  const getTableTitle = () =>
    `Payroll Details - ${activePayrollSubTab === "Prev Month" ? prevMonthRanges.prevMonth.label : prevMonthRanges.ytd.rangeLabel}`;

  return (
    <DataTable
      title={getTableTitle()}
      loading={loading}
      loadingText="Loading payroll data..."
      emptyText="No payroll data found"
      columns={columns}
      data={payrollData}
    />
  );
};
