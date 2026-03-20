import { useState, useEffect } from "react";
import {
  ShoppingCart,
  TrendingUp,
  Package,
  Receipt,
  DollarSign,
  AlertCircle,
  CreditCard,
  Building2,
} from "lucide-react";
import { formatCurrency } from "./DashboardUtil";

const DashboardCard = ({
  title,
  amount,
  icon: Icon,
  color,
  subtitle,
  growth,
  isActive,
  onClick,
  onDateFilterClick,
  onClearDateFilter,
  isCustomDateActive = false,
  customDateRanges = {},
}) => {
  const colorClasses = {
    blue: { text: "text-blue-600", bg: "bg-blue-100" },
    orange: { text: "text-orange-600", bg: "bg-orange-100" },
    green: { text: "text-green-600", bg: "bg-green-100" },
    red: { text: "text-red-600", bg: "bg-red-100" },
    purple: { text: "text-purple-600", bg: "bg-purple-100" },
    indigo: { text: "text-indigo-600", bg: "bg-indigo-100" },
    pink: { text: "text-pink-600", bg: "bg-pink-100" },
    teal: { text: "text-teal-600", bg: "bg-teal-100" },
  };

  const colors = colorClasses[color] || colorClasses.blue;

  // Smart date formatter for custom ranges
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

  const formatDateRange = () => {
    if (!isCustomDateActive || !customDateRanges[title]) return null;
    const start = customDateRanges[title]?.start;
    const end = customDateRanges[title]?.end;
    if (!start || !end) return null;
    return formatDateRangeSmart(start, end);
  };

  const customDateText = formatDateRange();

  return (
    <div
      className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all relative ${
        isActive ? "bg-gray-200" : "bg-white"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${colors.text}`} />
            <p className="text-sm font-medium text-gray-600">{title}</p>
          </div>
          <p className={`text-2xl font-bold ${colors.text} mt-2`}>
            ${formatCurrency(amount || 0)}
          </p>
          <div className="text-xs text-gray-500 mt-1">
            {isCustomDateActive && customDateText ? (
              <>
                <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                  {customDateText}
                </span>
                {growth !== undefined && " • "}
                {growth !== undefined && (
                  <span
                    className={growth >= 0 ? "text-green-600" : "text-red-600"}
                  >
                    {growth >= 0 ? "↗" : "↘"} {growth.toFixed(1)}%
                  </span>
                )}
              </>
            ) : (
              <>
                {subtitle}
                {growth !== undefined && " • "}
                {growth !== undefined && (
                  <span
                    className={growth >= 0 ? "text-green-600" : "text-red-600"}
                  >
                    {growth >= 0 ? "↗" : "↘"} {growth.toFixed(1)}%
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const DashboardCards = ({
  activeTab,
  onTabChange,
  salesData,
  outstandingData,
  stockData,
  expenseData,
  totalPayroll,
  payrollYTDTotal,
  companyBalance,
  creditSaleTotal,
  activeSalesSubTab,
  activeOutstandingSubTab,
  activeExpenseSubTab,
  activePayrollSubTab,
  activeStockSubTab,
  activePendingCollectionSubTab,
  onSalesSubTabChange,
  onExpenseSubTabChange,
  onPayrollSubTabChange,
  onOutstandingSubTabChange,
  onStockSubTabChange,
  onPendingCollectionSubTabChange,
  dateRanges,
  prevMonthRanges,
  overdueTableData,
  creditSaleTableData,
  onDateFilterClick,
  onClearDateFilter,
  isCustomDateActive = {},
  customDateRanges = {},
  onCurrentMonthSaleClick,
}) => {
  const [highestPayrollValue, setHighestPayrollValue] = useState(0);
  const [hasPayrollDataLoaded, setHasPayrollDataLoaded] = useState(false);

  useEffect(() => {
    if (totalPayroll > highestPayrollValue)
      setHighestPayrollValue(totalPayroll);
    if (totalPayroll > 0 && !hasPayrollDataLoaded)
      setHasPayrollDataLoaded(true);
  }, [totalPayroll]);

  const getSafeNumber = (value) => (typeof value === "number" ? value : 0);

  // Smart date formatter for custom ranges (used in getDateRangeText)
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

  const getDateRangeText = (cardId) => {
    if (!isCustomDateActive[cardId] || !customDateRanges[cardId]) return null;
    const start = customDateRanges[cardId]?.start;
    const end = customDateRanges[cardId]?.end;
    if (!start || !end) return null;
    return formatDateRangeSmart(start, end);
  };

  const getMonthName = () => {
    return new Date().toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  const getYTDRange = () => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const formatDate = (date) =>
      date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    return `${formatDate(startOfYear)} – ${formatDate(now)}`;
  };

  // ✅ FIX: Added "Today" case
  const getCurrentSalesAmount = () => {
    if (!salesData) return 0;
    if (
      isCustomDateActive["Total Sales"] &&
      salesData.customSales !== undefined
    )
      return getSafeNumber(salesData.customSales);
    switch (activeSalesSubTab) {
      case "Today":
        return getSafeNumber(salesData.todaySales);
      case "Month":
        return getSafeNumber(salesData.monthlySales);
      case "Year":
        return getSafeNumber(salesData.yearSales);
      case "All":
        return getSafeNumber(salesData.allSales);
      default:
        return 0;
    }
  };

  // ✅ FIX: Added "Today" case (if you have todayGrowth, otherwise return 0)
  const getCurrentSalesGrowth = () => {
    if (!salesData) return 0;
    if (
      isCustomDateActive["Total Sales"] &&
      salesData.customGrowth !== undefined
    )
      return getSafeNumber(salesData.customGrowth);
    switch (activeSalesSubTab) {
      case "Today":
        return getSafeNumber(salesData.todayGrowth); // or return 0 if not available
      case "Month":
        return getSafeNumber(salesData.monthlyGrowth);
      case "YTD":
        return getSafeNumber(salesData.ytdGrowth);
      default:
        return 0;
    }
  };

  const getCurrentOutstandingAmount = () => {
    if (!outstandingData) return 0;
    if (
      isCustomDateActive["Outstanding"] &&
      outstandingData.customOutstanding !== undefined
    )
      return getSafeNumber(outstandingData.customOutstanding);
    switch (activeOutstandingSubTab) {
      case "Month":
        return getSafeNumber(outstandingData.monthlyOutstanding);
      case "YTD":
        return getSafeNumber(outstandingData.ytdOutstanding);
      case "All":
        return getSafeNumber(outstandingData.allOutstanding);
      default:
        return 0;
    }
  };

  const getCurrentOutstandingGrowth = () => {
    if (!outstandingData) return 0;
    if (
      isCustomDateActive["Outstanding"] &&
      outstandingData.customGrowth !== undefined
    )
      return getSafeNumber(outstandingData.customGrowth);
    switch (activeOutstandingSubTab) {
      case "Month":
        return getSafeNumber(outstandingData.monthlyGrowth);
      case "YTD":
        return getSafeNumber(outstandingData.ytdGrowth);
      default:
        return 0;
    }
  };

  const getCurrentExpenseAmount = () => {
    if (!expenseData) return 0;
    if (
      isCustomDateActive["Total Expense"] &&
      expenseData.customExpenseTotal !== undefined
    )
      return getSafeNumber(expenseData.customExpenseTotal);
    switch (activeExpenseSubTab) {
      case "Month":
        return getSafeNumber(expenseData.monthlyExpense);
      case "YTD":
        return getSafeNumber(expenseData.ytdExpense);
      case "All":
        return getSafeNumber(expenseData.allExpense);
      default:
        return getSafeNumber(expenseData.monthlyExpense);
    }
  };

  const getCurrentPayrollAmount = () => {
    if (
      activePayrollSubTab === "Prev Month" &&
      !isCustomDateActive["Total Payroll"]
    ) {
      if (getSafeNumber(totalPayroll) > 0) return getSafeNumber(totalPayroll);
      return highestPayrollValue > 0 ? highestPayrollValue : 0;
    }
    switch (activePayrollSubTab) {
      case "YTD":
        return getSafeNumber(payrollYTDTotal);
      case "Pending":
        return getSafeNumber(expenseData?.pendingPayroll);
      case "Paid":
        return getSafeNumber(expenseData?.paidPayroll);
      case "Overdue":
        return getSafeNumber(expenseData?.overduePayroll);
      case "Unreceive_Payment":
        return getSafeNumber(expenseData?.unpaidPayroll);
      default:
        return getSafeNumber(totalPayroll);
    }
  };

  const getCurrentStockAmount = () => {
    if (!stockData) return 0;
    switch (activeStockSubTab) {
      case "all":
        return getSafeNumber(stockData.totalStockValue);
      case "mr":
        return getSafeNumber(stockData.mrStockValue);
      case "warehouse":
        return getSafeNumber(stockData.warehouseStockValue);
      default:
        return getSafeNumber(stockData.totalStockValue);
    }
  };

  const getOverdueAmount = () => {
    if (overdueTableData && overdueTableData.length > 0) {
      return overdueTableData.reduce((sum, invoice) => {
        const amt = getSafeNumber(
          invoice.overdueAmount ||
            (invoice.dueAmount > 0
              ? invoice.dueAmount
              : Math.max(
                  0,
                  getSafeNumber(invoice.totalAmount) -
                    getSafeNumber(invoice.paidAmount),
                )),
        );
        return sum + amt;
      }, 0);
    }
    return getSafeNumber(salesData?.overdueAmount);
  };

  const getCreditSaleCashNotReceived = () => {
    if (typeof creditSaleTotal === "number" && creditSaleTotal >= 0) {
      return creditSaleTotal;
    }
    if (creditSaleTableData && creditSaleTableData.length > 0) {
      return creditSaleTableData.reduce(
        (total, invoice) =>
          total + getSafeNumber(invoice.outstandingAmount || invoice.dueAmount),
        0,
      );
    }
    return getSafeNumber(salesData?.unreceivePayment || salesData?.creditSale);
  };

  const getSubtitle = (cardId) => {
    if (isCustomDateActive[cardId]) {
      const customRange = getDateRangeText(cardId);
      if (customRange) return customRange;
    }

    switch (cardId) {
      case "Total Sales":
        if (activeSalesSubTab === "Month") return getMonthName();
        if (activeSalesSubTab === "YTD") return getYTDRange();
        if (activeSalesSubTab === "All") return "All Records";
        return activeSalesSubTab;

      case "Current Month Sale":
        return getMonthName();

      case "Outstanding":
        if (activeOutstandingSubTab === "Month") return getMonthName();
        if (activeOutstandingSubTab === "YTD") return getYTDRange();
        if (activeOutstandingSubTab === "All") return "All Records";
        return activeOutstandingSubTab;

      case "Total Expense":
        if (activeExpenseSubTab === "Month") return getMonthName();
        if (activeExpenseSubTab === "YTD") return getYTDRange();
        if (activeExpenseSubTab === "All") return "All Records";
        return activeExpenseSubTab;

      case "Total Payroll":
        return activePayrollSubTab === "Prev Month"
          ? "Previous Month"
          : activePayrollSubTab;

      case "Stock in Hands":
        if (activeStockSubTab === "all") return "All Stock";
        if (activeStockSubTab === "mr") return "MR Stock";
        if (activeStockSubTab === "warehouse") return "Warehouse Stock";
        return activeStockSubTab;

      case "Pending Collection":
        if (activePendingCollectionSubTab === "Month") return getMonthName();
        if (activePendingCollectionSubTab === "YTD") return getYTDRange();
        if (activePendingCollectionSubTab === "All") return "All Records";
        return activePendingCollectionSubTab;

      case "Overdue":
        return "Total Overdue";

      case "Company Balance":
        return "All Accounts";

      default:
        return "";
    }
  };

  const getActiveTabForCard = (cardTitle) => {
    const mapping = {
      "Total Sales": "Sales",
      "Total Expense": "Expenses",
      "Total Payroll": "Total Payroll",
      "Pending Collection": "Credit Sale Cash Not Receive",
    };
    return mapping[cardTitle] || cardTitle;
  };

  const cards = [
    {
      id: "Total Sales",
      title: "Total Sales",
      amount: getCurrentSalesAmount(),
      icon: ShoppingCart,
      color: "blue",
      subtitle: getSubtitle("Total Sales"),
      growth: getCurrentSalesGrowth(),
    },
    {
      id: "CurrentMonthSale",
      title: "Current Month Sale",
      amount: getSafeNumber(salesData?.monthlySales),
      icon: TrendingUp,
      color: "orange",
      subtitle: getSubtitle("Current Month Sale"),
      growth: getSafeNumber(salesData?.monthlyGrowth),
    },
    {
      id: "Stock in Hands",
      title: "Stock in Hands",
      amount: getCurrentStockAmount(),
      icon: Package,
      color: "green",
      subtitle: getSubtitle("Stock in Hands"),
    },
    {
      id: "Total Expense",
      title: "Total Expense",
      amount: getCurrentExpenseAmount(),
      icon: Receipt,
      color: "red",
      subtitle: getSubtitle("Total Expense"),
    },
    {
      id: "Total Payroll",
      title: "Total Payroll",
      amount: getCurrentPayrollAmount(),
      icon: DollarSign,
      color: "purple",
      subtitle: getSubtitle("Total Payroll"),
    },
    {
      id: "Overdue",
      title: "Overdue",
      amount: getOverdueAmount(),
      icon: AlertCircle,
      color: "red",
      subtitle: getSubtitle("Overdue"),
      growth: getSafeNumber(salesData?.overdueGrowth),
    },
    {
      id: "Pending Collection",
      title: "Pending Collection",
      amount: getCreditSaleCashNotReceived(),
      icon: CreditCard,
      color: "indigo",
      subtitle: getSubtitle("Pending Collection"),
      growth: getSafeNumber(salesData?.unreceivePaymentGrowth),
    },
    {
      id: "Company Balance",
      title: "Company Balance",
      amount: getSafeNumber(companyBalance),
      icon: Building2,
      color: "teal",
      subtitle: getSubtitle("Company Balance"),
    },
  ];

  const firstRowCards = cards.slice(0, 4);
  const secondRowCards = cards.slice(4, 8);

  return (
    <div className="space-y-6 mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {firstRowCards.map((card) => {
          // Determine active state for each card
          let isCardActive = false;
          if (card.id === "CurrentMonthSale") {
            // Current Month Sale is active only when Sales tab is active and subtab is "Month"
            isCardActive =
              activeTab === "Sales" && activeSalesSubTab === "Month";
          } else if (card.id === "Total Sales") {
            // Total Sales is active when Sales tab is active and subtab is NOT "Month"
            // (i.e., Today, YTD, All, or Custom)
            isCardActive =
              activeTab === "Sales" && activeSalesSubTab !== "Month";
          } else {
            // All other cards use the standard mapping
            isCardActive = activeTab === getActiveTabForCard(card.title);
          }

          return (
            <DashboardCard
              key={card.id}
              {...card}
              isActive={isCardActive}
              onClick={
                card.id === "CurrentMonthSale"
                  ? onCurrentMonthSaleClick
                  : () => onTabChange(getActiveTabForCard(card.title))
              }
              onDateFilterClick={onDateFilterClick}
              onClearDateFilter={onClearDateFilter}
              isCustomDateActive={isCustomDateActive[card.title] || false}
              customDateRanges={customDateRanges}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {secondRowCards.map((card) => {
          // Second row cards use standard mapping (none of them are "CurrentMonthSale")
          const isCardActive = activeTab === getActiveTabForCard(card.title);
          return (
            <DashboardCard
              key={card.id}
              {...card}
              isActive={isCardActive}
              onClick={() => onTabChange(getActiveTabForCard(card.title))}
              onDateFilterClick={onDateFilterClick}
              onClearDateFilter={onClearDateFilter}
              isCustomDateActive={isCustomDateActive[card.title] || false}
              customDateRanges={customDateRanges}
            />
          );
        })}
      </div>
    </div>
  );
};