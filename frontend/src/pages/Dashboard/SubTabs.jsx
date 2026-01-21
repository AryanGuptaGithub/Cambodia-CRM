import React from "react";
import { Calendar } from "lucide-react";

const TabButton = ({ isActive, onClick, children, showCalendar = false, onCalendarClick, isCustomActive = false }) => {
  return (
    <div className="relative flex items-center">
      <button
        className={`px-3 py-1 text-sm font-medium rounded-md transition-colors cursor-pointer ${
          isActive
            ? "bg-white text-gray-800 shadow-sm"
            : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
        }`}
        onClick={onClick}
      >
        {children}
      </button>
      {showCalendar && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCalendarClick();
          }}
          className={`flex items-center justify-center h-7 rounded-md transition-colors cursor-pointer ${
            isCustomActive
              ? "bg-white text-blue-600 shadow-sm border border-gray-200"
              : "text-gray-400 hover:text-blue-600 hover:bg-gray-50"
          }`}
          title={isCustomActive ? "Custom date range active" : "Set custom date range"}
        >
          <Calendar size={14} />
        </button>
      )}
    </div>
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
  isCustomDateActive = {},
  customDateRanges = {},
  onDateFilterClick,
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

  // Helper function to get formatted date range
  const getFormattedDateRange = (cardTitle) => {
    if (!isCustomDateActive[cardTitle] || !customDateRanges[cardTitle]) {
      return null;
    }
    
    const start = new Date(customDateRanges[cardTitle].start);
    const end = new Date(customDateRanges[cardTitle].end);
    
    const formatDate = (date) => {
      return date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
      });
    };
    
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  // Helper function to map activeTab to cardTitle
  const getCardTitle = (activeTab) => {
    switch (activeTab) {
      case "Sales":
        return "Total Sales";
      case "Expenses":
        return "Total Expense";
      case "Total Payroll":
        return "Total Payroll";
      case "Outstanding":
        return "Outstanding";
      default:
        return "";
    }
  };

  const renderTabs = () => {
    const cardTitle = getCardTitle(activeTab);
    const isCustomActive = isCustomDateActive[cardTitle];
    let tabs = [];

    switch (activeTab) {
      case "Sales":
        tabs = [
          { key: "Today", label: "Today" },
          { key: "Month", label: dateRanges.month.label },
          { key: "Year", label: dateRanges.year.rangeLabel },
        ];
        
        // Always show Custom tab
        const customRange = getFormattedDateRange(cardTitle);
        tabs.push({ 
          key: "Custom", 
          label: customRange || "Custom", 
          showCalendar: true 
        });
        
        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeSalesSubTab === tab.key}
            isCustomActive={tab.key === "Custom" && isCustomActive}
            onClick={() => {
              if (tab.key === "Custom") {
                // If custom is not active yet, open the modal to set dates
                if (!isCustomActive) {
                  onDateFilterClick(cardTitle);
                } else {
                  onSalesSubTabChange(tab.key);
                }
              } else {
                onSalesSubTabChange(tab.key);
              }
            }}
            showCalendar={tab.showCalendar || false}
            onCalendarClick={() => onDateFilterClick(cardTitle)}
          >
            {tab.label}
          </TabButton>
        ));

      case "Expenses":
        tabs = [
          { key: "Month", label: dateRanges.month.label },
          { key: "Year", label: dateRanges.year.rangeLabel },
        ];
        
        const expenseCustomRange = getFormattedDateRange(cardTitle);
        tabs.push({ 
          key: "Custom", 
          label: expenseCustomRange || "Custom", 
          showCalendar: true 
        });
        
        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeExpenseSubTab === tab.key}
            isCustomActive={tab.key === "Custom" && isCustomActive}
            onClick={() => {
              if (tab.key === "Custom") {
                if (!isCustomActive) {
                  onDateFilterClick(cardTitle);
                } else {
                  onExpenseSubTabChange(tab.key);
                }
              } else {
                onExpenseSubTabChange(tab.key);
              }
            }}
            showCalendar={tab.showCalendar || false}
            onCalendarClick={() => onDateFilterClick(cardTitle)}
          >
            {tab.label}
          </TabButton>
        ));

      case "Total Payroll":
        tabs = [
          { key: "Prev Month", label: prevMonthRanges.prevMonth.label },
          { key: "YTD", label: prevMonthRanges.ytd.rangeLabel },
        ];
        
        const payrollCustomRange = getFormattedDateRange(cardTitle);
        tabs.push({ 
          key: "Custom", 
          label: payrollCustomRange || "Custom", 
          showCalendar: true 
        });
        
        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activePayrollSubTab === tab.key}
            isCustomActive={tab.key === "Custom" && isCustomActive}
            onClick={() => {
              if (tab.key === "Custom") {
                if (!isCustomActive) {
                  onDateFilterClick(cardTitle);
                } else {
                  onPayrollSubTabChange(tab.key);
                }
              } else {
                onPayrollSubTabChange(tab.key);
              }
            }}
            showCalendar={tab.showCalendar || false}
            onCalendarClick={() => onDateFilterClick(cardTitle)}
          >
            {tab.label}
          </TabButton>
        ));

      case "Outstanding":
        tabs = [
          { key: "Today", label: "Today" },
          { key: "Month", label: dateRanges.month.label },
          { key: "Year", label: dateRanges.year.rangeLabel },
        ];
        
        const outstandingCustomRange = getFormattedDateRange(cardTitle);
        tabs.push({ 
          key: "Custom", 
          label: outstandingCustomRange || "Custom", 
          showCalendar: true 
        });
        
        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeOutstandingSubTab === tab.key}
            isCustomActive={tab.key === "Custom" && isCustomActive}
            onClick={() => {
              if (tab.key === "Custom") {
                if (!isCustomActive) {
                  onDateFilterClick(cardTitle);
                } else {
                  onOutstandingSubTabChange(tab.key);
                }
              } else {
                onOutstandingSubTabChange(tab.key);
              }
            }}
            showCalendar={tab.showCalendar || false}
            onCalendarClick={() => onDateFilterClick(cardTitle)}
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