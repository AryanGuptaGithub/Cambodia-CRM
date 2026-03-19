import React from "react";
import { Calendar } from "lucide-react";

const TabButton = ({
  isActive,
  onClick,
  children,
  showCalendar = false,
  onCalendarClick,
  isCustomActive = false,
}) => {
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
          className={`flex items-center justify-center h-7 rounded-md transition-colors cursor-pointer ml-1 px-1 ${
            isCustomActive
              ? "bg-white text-blue-600 shadow-sm border border-gray-200"
              : "text-gray-400 hover:text-blue-600 hover:bg-gray-50"
          }`}
          title={
            isCustomActive
              ? "Custom date range active"
              : "Set custom date range"
          }
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
  activeStockSubTab,
  activePendingCollectionSubTab,
  onSalesSubTabChange,
  onExpenseSubTabChange,
  onPayrollSubTabChange,
  onStockSubTabChange,
  onPendingCollectionSubTabChange,
  dateRanges,
  prevMonthRanges,
  isCustomDateActive = {},
  customDateRanges = {},
  onDateFilterClick,
  forceSalesMonthOnly = false,
}) => {
  const TABS_WITH_SUBTABS = [
    "Sales",
    "Expenses",
    "Total Payroll",
    "Stock in Hands",
    "Credit Sale Cash Not Receive",
  ];

  if (!TABS_WITH_SUBTABS.includes(activeTab)) return null;

  const formatDateRangeSmart = (start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    const options = { day: "numeric", month: "short" };
    if (!sameYear) options.year = "numeric";
    const startStr = startDate.toLocaleDateString("en-US", options);
    const endStr = endDate.toLocaleDateString("en-US", options);
    return `${startStr} – ${endStr}`;
  };

  const getFormattedDateRange = (cardTitle) => {
    if (!isCustomDateActive[cardTitle] || !customDateRanges[cardTitle])
      return null;
    const start = new Date(customDateRanges[cardTitle].start);
    const end = new Date(customDateRanges[cardTitle].end);
    return formatDateRangeSmart(start, end);
  };

  const getCardTitle = (tab) => {
    switch (tab) {
      case "Sales":
        return "Total Sales";
      case "Expenses":
        return "Total Expense";
      case "Total Payroll":
        return "Total Payroll";
      case "Credit Sale Cash Not Receive":
        return "Pending Collection";
      default:
        return "";
    }
  };

  const renderTabs = () => {
    const cardTitle = getCardTitle(activeTab);
    const isCustomActive = isCustomDateActive[cardTitle];
    switch (activeTab) {
      case "Sales": {
        const tabs = forceSalesMonthOnly
          ? [
              {
                key: "Month",
                label: dateRanges?.month?.label || "This Month",
              },
            ]
          : [
              { key: "Today", label: "Today" },
              {
                key: "Month",
                label: dateRanges?.month?.label || "This Month",
              },
              {
                key: "Year",
                label: dateRanges?.year?.rangeLabel || "This Year",
              },
              { key: "All", label: "All" },
              {
                key: "Custom",
                label: getFormattedDateRange(cardTitle) || "Custom",
                showCalendar: true,
              },
            ];

        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeSalesSubTab === tab.key}
            isCustomActive={tab.key === "Custom" && isCustomActive}
            onClick={() => {
              if (tab.key === "Custom") {
                if (!isCustomActive) onDateFilterClick(cardTitle);
                else onSalesSubTabChange(tab.key);
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
      }

      case "Expenses": {
        const tabs = [
          { key: "Month", label: dateRanges?.month?.label || "This Month" },
          { key: "Year", label: dateRanges?.year?.rangeLabel || "This Year" },
          { key: "All", label: "All" },
          {
            key: "Custom",
            label: getFormattedDateRange(cardTitle) || "Custom",
            showCalendar: true,
          },
        ];
        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeExpenseSubTab === tab.key}
            isCustomActive={tab.key === "Custom" && isCustomActive}
            onClick={() => {
              if (tab.key === "Custom") {
                if (!isCustomActive) onDateFilterClick(cardTitle);
                else onExpenseSubTabChange(tab.key);
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
      }

      case "Total Payroll": {
        const tabs = [
          {
            key: "Prev Month",
            label: prevMonthRanges?.prevMonth?.label || "Prev Month",
          },
          {
            key: "YTD",
            label: prevMonthRanges?.ytd?.rangeLabel || "YTD",
          },
          { key: "All", label: "All" },
          {
            key: "Custom",
            label: getFormattedDateRange(cardTitle) || "Custom",
            showCalendar: true,
          },
        ];
        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activePayrollSubTab === tab.key}
            isCustomActive={tab.key === "Custom" && isCustomActive}
            onClick={() => {
              if (tab.key === "Custom") {
                if (!isCustomActive) onDateFilterClick(cardTitle);
                else onPayrollSubTabChange(tab.key);
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
      }

      case "Stock in Hands": {
        return [{ key: "all", label: "All" }].map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activeStockSubTab === tab.key}
            onClick={() => onStockSubTabChange(tab.key)}
          >
            {tab.label}
          </TabButton>
        ));
      }

      case "Credit Sale Cash Not Receive": {
        const tabs = [
          { key: "Month", label: dateRanges?.month?.label || "This Month" },
          { key: "Year", label: dateRanges?.year?.rangeLabel || "This Year" },
          { key: "All", label: "All" },
          { key: "Today", label: "Today" },
          {
            key: "Custom",
            label: getFormattedDateRange(cardTitle) || "Custom",
            showCalendar: true,
          },
        ];
        return tabs.map((tab) => (
          <TabButton
            key={tab.key}
            isActive={activePendingCollectionSubTab === tab.key}
            isCustomActive={tab.key === "Custom" && isCustomActive}
            onClick={() => {
              if (tab.key === "Custom") {
                if (!isCustomActive) onDateFilterClick(cardTitle);
                else onPendingCollectionSubTabChange(tab.key);
              } else {
                onPendingCollectionSubTabChange(tab.key);
              }
            }}
            showCalendar={tab.showCalendar || false}
            onCalendarClick={() => onDateFilterClick(cardTitle)}
          >
            {tab.label}
          </TabButton>
        ));
      }

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