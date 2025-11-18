import {DataTable} from "./DataTable";

export const PayrollTable = ({
  payrollData,
  loading,
  activePayrollSubTab,
  prevMonthRanges
}) => {
  const columns = [
    {
      header: "MR Name",
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold">
            {item.employeeId?.medicalRepName
              ? item.employeeId.medicalRepName.substring(0, 2).toUpperCase()
              : "MR"}
          </div>
          <span className="capitalize">{item.employeeId?.medicalRepName}</span>
        </div>
      )
    },
    { 
      header: "Contact No", 
      accessor: "employeeId.contactNo" 
    },
    { 
      header: "Email", 
      accessor: "employeeId.email" 
    },
    { 
      header: "Basic Salary ($)", 
      render: (item) => 
        <span className="font-semibold text-blue-700">
          {item.basicSalary || 0}
        </span>
    },
    { 
      header: "Allowances ($)", 
      render: (item) => 
        <span className="font-semibold text-green-700">
          {item.totalAllowance || 0}
        </span>
    },
    { 
      header: "Deductions ($)", 
      render: (item) => 
        <span className="font-semibold text-red-700">
          {item.deductions || 0}
        </span>
    },
    { 
      header: "Net Salary ($)", 
      render: (item) => 
        <span className="font-semibold text-purple-700">
          {item.netSalary || 0}
        </span>
    }
  ];

  return (
    <DataTable
      title={`Payroll Details - ${
        activePayrollSubTab === "Prev Month"
          ? prevMonthRanges.prevMonth.label
          : prevMonthRanges.prevMonthYear.label
      }`}
      loading={loading}
      loadingText="Loading..."
      emptyText="No payroll data found"
      columns={columns}
      data={payrollData}
    />
  );
};