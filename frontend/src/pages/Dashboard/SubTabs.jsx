// Add the TabButton component definition or import it
const TabButton = ({ isActive, onClick, children }) => {
  return (
    <button
      className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
        isActive
          ? "bg-white text-gray-800 shadow-sm"
          : "text-gray-600 hover:text-gray-800"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

export const SubTabs = ({
  activeTab,
  activeSalesSubTab,
  activeExpenseSubTab,
  activePayrollSubTab,
  activeOutstandingSubTab,
  activeStockSubTab,
  onSalesSubTabChange,
  onExpenseSubTabChange,
  onPayrollSubTabChange,
  onOutstandingSubTabChange,
  onStockSubTabChange,
  dateRanges,
  prevMonthRanges,
}) => {
  if (
    activeTab !== "Sales" &&
    activeTab !== "Expenses" &&
    activeTab !== "Total Payroll" &&
    activeTab !== "Outstanding" &&
    activeTab !== "Stock in Hands"
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

      case "Expenses":
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
          { key: "Prev Month", label: prevMonthRanges.prevMonth.label }, // e.g., "Oct"
          { key: "YTD", label: prevMonthRanges.ytd.rangeLabel }, // e.g., "1 Jan - 31 Oct"
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

      case "Stock in Hands":
        return [{ key: "Today", label: "Today" }].map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeStockSubTab === tab.key}
            onClick={() => onStockSubTabChange(tab.key)}
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