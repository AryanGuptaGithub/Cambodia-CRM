import React from "react";
import { Calendar } from "lucide-react";

const TabButton = ({ isActive, onClick, children, showCalendar = false, onCalendarClick }) => {
  return (
    <div className="relative">
      <button
        className={`px-3 py-1 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
          isActive
            ? "bg-white text-gray-800 shadow-sm"
            : "text-gray-600 hover:text-gray-800"
        }`}
        onClick={onClick}
      >
        {children}
        {showCalendar && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCalendarClick();
            }}
            className="text-gray-400 hover:text-blue-600 transition-colors"
            title="Set custom date range"
          >
            <Calendar size={14} />
          </button>
        )}
      </button>
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
  const getDateRangeText = (cardId) => {
    if (isCustomDateActive[cardId] && customDateRanges[cardId]) {
      const start = new Date(customDateRanges[cardId].start);
      const end = new Date(customDateRanges[cardId].end);
      
      const formatDate = (date) => {
        return date.toLocaleDateString("en-US", {
          day: "numeric",
          month: "short",
        });
      };
      
      return `${formatDate(start)} - ${formatDate(end)}`;
    }
    return null;
  };

  const renderTabs = () => {
    const cardTitle = getCardTitle(activeTab);
    let tabs = [];

    switch (activeTab) {
      case "Sales":
        tabs = [
          { key: "Today", label: "Today" },
          { key: "Month", label: dateRanges.month.label },
          { key: "Year", label: dateRanges.year.rangeLabel },
        ];
        
        // Check if custom date is active for this card
        if (isCustomDateActive[cardTitle]) {
          const customRange = getDateRangeText(cardTitle);
          if (customRange) {
            tabs.push({ 
              key: "Custom", 
              label: customRange, 
              showCalendar: true 
            });
          } else {
            tabs.push({ 
              key: "Custom", 
              label: "Custom", 
              showCalendar: true 
            });
          }
        } else {
          // Add Custom button even if not active (to allow setting custom date)
          tabs.push({ 
            key: "Custom", 
            label: "Custom", 
            showCalendar: true 
          });
        }
        
        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeSalesSubTab === tab.key}
            onClick={() => onSalesSubTabChange(tab.key)}
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
        
        if (isCustomDateActive[cardTitle]) {
          const customRange = getFormattedDateRange(cardTitle);
          if (customRange) {
            tabs.push({ 
              key: "Custom", 
              label: customRange, 
              showCalendar: true 
            });
          } else {
            tabs.push({ 
              key: "Custom", 
              label: "Custom", 
              showCalendar: true 
            });
          }
        } else {
          tabs.push({ 
            key: "Custom", 
            label: "Custom", 
            showCalendar: true 
          });
        }
        
        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeExpenseSubTab === tab.key}
            onClick={() => onExpenseSubTabChange(tab.key)}
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
        
        if (isCustomDateActive[cardTitle]) {
          const customRange = getFormattedDateRange(cardTitle);
          if (customRange) {
            tabs.push({ 
              key: "Custom", 
              label: customRange, 
              showCalendar: true 
            });
          } else {
            tabs.push({ 
              key: "Custom", 
              label: "Custom", 
              showCalendar: true 
            });
          }
        } else {
          tabs.push({ 
            key: "Custom", 
            label: "Custom", 
            showCalendar: true 
          });
        }
        
        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activePayrollSubTab === tab.key}
            onClick={() => onPayrollSubTabChange(tab.key)}
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
        
        if (isCustomDateActive[cardTitle]) {
          const customRange = getFormattedDateRange(cardTitle);
          if (customRange) {
            tabs.push({ 
              key: "Custom", 
              label: customRange, 
              showCalendar: true 
            });
          } else {
            tabs.push({ 
              key: "Custom", 
              label: "Custom", 
              showCalendar: true 
            });
          }
        } else {
          tabs.push({ 
            key: "Custom", 
            label: "Custom", 
            showCalendar: true 
          });
        }
        
        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeOutstandingSubTab === tab.key}
            onClick={() => onOutstandingSubTabChange(tab.key)}
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