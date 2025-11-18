const TabButton = ({ isActive, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? "bg-white text-gray-900 shadow-sm"
        : "text-gray-600 hover:text-gray-900"
    }`}
  >
    {children}
  </button>
);

export const SubTabs = ({
  activeTab,
  activeSalesSubTab,
  activeExpenseSubTab,
  activePayrollSubTab,
  activeOutstandingSubTab,
  onSalesSubTabChange,
  onExpenseSubTabChange,
  onPayrollSubTabChange,
  onOutstandingSubTabChange,
  dateRanges,
  prevMonthRanges
}) => {
  if (
    activeTab !== "Sales" &&
    activeTab !== "Expense" &&
    activeTab !== "Total Payroll" &&
    activeTab !== "Outstanding"
  ) {
    return null;
  }

  const renderTabs = () => {
    switch (activeTab) {
      case "Sales":
        return [
          { key: "Today", label: "Today" },
          { key: "Month", label: dateRanges.month.label },
          { key: "Year", label: dateRanges.year.rangeLabel },
        ].map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeSalesSubTab === tab.key}
            onClick={() => onSalesSubTabChange(tab.key)}
          >
            {tab.label}
          </TabButton>
        ));

      case "Expense":
        return [
          { key: "Month", label: dateRanges.month.label },
          { key: "Year", label: dateRanges.year.rangeLabel },
        ].map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeExpenseSubTab === tab.key}
            onClick={() => onExpenseSubTabChange(tab.key)}
          >
            {tab.label}
          </TabButton>
        ));

      case "Total Payroll":
        return [
          { key: "Prev Month", label: prevMonthRanges.prevMonth.label },
          { key: "YTD", label: prevMonthRanges.prevMonthYear.label },
        ].map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activePayrollSubTab === tab.key}
            onClick={() => onPayrollSubTabChange(tab.key)}
          >
            {tab.label}
          </TabButton>
        ));

      case "Outstanding":
        return [
          { key: "Today", label: "Today" },
          { key: "Month", label: dateRanges.month.label },
          { key: "Year", label: dateRanges.year.rangeLabel },
        ].map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeOutstandingSubTab === tab.key}
            onClick={() => onOutstandingSubTabChange(tab.key)}
          >
            {tab.label}
          </TabButton>
        ));

      default:
        return null;
    }
  };

  return (
    <div className="flex space-x-1 mb-6 p-1 bg-gray-100 rounded-lg w-fit">
      {renderTabs()}
    </div>
  );
};