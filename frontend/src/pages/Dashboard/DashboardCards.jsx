import { useState, useEffect } from "react";
import {
  ShoppingCart,
  TrendingUp,
  Package,
  Receipt,
  DollarSign,
  AlertCircle,
  CreditCard,
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
  };

  const colors = colorClasses[color] || colorClasses.blue;

  const showDateFilterButton = [
    "Total Sales",
    "Outstanding",
    "Total Expense",
    "Total Payroll",
  ].includes(title);

  const formatDateRange = () => {
    if (!isCustomDateActive || !customDateRanges[title]) return null;
    const start = customDateRanges[title]?.start;
    const end = customDateRanges[title]?.end;
    if (!start || !end) return null;
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
      });
    };
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  const customDateText = formatDateRange();

  const handleDateFilterButtonClick = (e) => {
    e.stopPropagation();
    if (isCustomDateActive && onClearDateFilter) {
      onClearDateFilter(title, e);
    } else if (onDateFilterClick) {
      onDateFilterClick(title);
    }
  };

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
  activeSalesSubTab,
  activeOutstandingSubTab,
  activeExpenseSubTab,
  activePayrollSubTab,
  activeStockSubTab,
  onSalesSubTabChange,
  onExpenseSubTabChange,
  onPayrollSubTabChange,
  onOutstandingSubTabChange,
  onStockSubTabChange,
  dateRanges,
  prevMonthRanges,
  overdueTableData,
  creditSaleTableData,
  onDateFilterClick,
  onClearDateFilter,
  isCustomDateActive = {},
  customDateRanges = {},
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

  const getDateRangeText = (cardId) => {
    if (!isCustomDateActive[cardId] || !customDateRanges[cardId]) return null;
    const start = customDateRanges[cardId]?.start;
    const end = customDateRanges[cardId]?.end;
    if (!start || !end) return null;
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
      });
    };
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

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
      case "Credit_Sale":
        return getSafeNumber(salesData.creditSale);
      case "Pending":
        return getSafeNumber(salesData.pendingSales);
      case "Collected":
        return getSafeNumber(salesData.collectedSales);
      case "Overdue":
        return getSafeNumber(salesData.overdueAmount);
      case "Unreceive_Payment":
        return getSafeNumber(salesData.unreceivePayment);
      default:
        return getSafeNumber(salesData.todaySales);
    }
  };

  const getCurrentGrowth = () => {
    if (!salesData) return 0;
    if (
      isCustomDateActive["Total Sales"] &&
      salesData.customGrowth !== undefined
    )
      return getSafeNumber(salesData.customGrowth);
    switch (activeSalesSubTab) {
      case "Today":
        return getSafeNumber(salesData.todayGrowth);
      case "Month":
        return getSafeNumber(salesData.monthlyGrowth);
      case "Year":
        return getSafeNumber(salesData.yearGrowth);
      case "Overdue":
        return getSafeNumber(salesData.overdueGrowth);
      case "Unreceive_Payment":
        return getSafeNumber(salesData.unreceivePaymentGrowth);
      default:
        return getSafeNumber(salesData.todayGrowth);
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
      case "Today":
        return getSafeNumber(outstandingData.todayOutstanding);
      case "Month":
        return getSafeNumber(outstandingData.monthlyOutstanding);
      case "Year":
        return getSafeNumber(outstandingData.yearOutstanding);
      case "30+ Days":
        return getSafeNumber(outstandingData.thirtyPlusDays);
      case "60+ Days":
        return getSafeNumber(outstandingData.sixtyPlusDays);
      case "90+ Days":
        return getSafeNumber(outstandingData.ninetyPlusDays);
      case "Overdue":
        return getSafeNumber(outstandingData.overdueAmount);
      case "Unreceive_Payment":
        return getSafeNumber(outstandingData.unreceivePayment);
      default:
        return getSafeNumber(outstandingData.todayOutstanding);
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
      case "Today":
        return getSafeNumber(outstandingData.todayGrowth);
      case "Month":
        return getSafeNumber(outstandingData.monthlyGrowth);
      case "Year":
        return getSafeNumber(outstandingData.yearGrowth);
      case "Overdue":
        return getSafeNumber(outstandingData.overdueGrowth);
      case "Unreceive_Payment":
        return getSafeNumber(outstandingData.unreceivePaymentGrowth);
      default:
        return getSafeNumber(outstandingData.todayGrowth);
    }
  };

  const getCurrentExpenseAmount = () => {
    if (!expenseData) return 0;
    if (
      isCustomDateActive["Total Expense"] &&
      expenseData.customExpenseTotal !== undefined
    )
      return getSafeNumber(expenseData.customExpenseTotal);
    if (!expenseData.latestExpenses) return 0;

    const currentDate = new Date();
    let filteredExpenses = [];

    switch (activeExpenseSubTab) {
      case "Month":
        filteredExpenses = expenseData.latestExpenses.filter((expense) => {
          const expenseDate = new Date(expense.date);
          return (
            expenseDate.getMonth() === currentDate.getMonth() &&
            expenseDate.getFullYear() === currentDate.getFullYear()
          );
        });
        break;
      case "Year":
        filteredExpenses = expenseData.latestExpenses.filter((expense) => {
          const expenseDate = new Date(expense.date);
          return expenseDate.getFullYear() === currentDate.getFullYear();
        });
        break;
      case "Pending":
        filteredExpenses = expenseData.latestExpenses.filter(
          (expense) => expense.status === "Pending",
        );
        break;
      case "Approved":
        filteredExpenses = expenseData.latestExpenses.filter(
          (expense) => expense.status === "Approved",
        );
        break;
      case "Rejected":
        filteredExpenses = expenseData.latestExpenses.filter(
          (expense) => expense.status === "Rejected",
        );
        break;
      case "Overdue":
        filteredExpenses = expenseData.latestExpenses.filter((expense) => {
          const dueDate = new Date(expense.dueDate || expense.date);
          return dueDate < currentDate && expense.status !== "Paid";
        });
        break;
      case "Unreceive_Payment":
        filteredExpenses = expenseData.latestExpenses.filter((expense) => {
          return expense.status === "Pending" || expense.status === "Unpaid";
        });
        break;
      default:
        filteredExpenses = expenseData.latestExpenses.filter((expense) => {
          const expenseDate = new Date(expense.date);
          return (
            expenseDate.getMonth() === currentDate.getMonth() &&
            expenseDate.getFullYear() === currentDate.getFullYear()
          );
        });
    }

    return filteredExpenses.reduce(
      (sum, expense) => sum + getSafeNumber(expense.amount),
      0,
    );
  };

  const getCurrentPayrollAmount = () => {
    if (
      activePayrollSubTab === "Prev Month" &&
      !isCustomDateActive["Total Payroll"]
    ) {
      if (getSafeNumber(totalPayroll) > 0) return getSafeNumber(totalPayroll);
      return highestPayrollValue > 0 ? highestPayrollValue : 0;
    }
    let amount = 0;
    switch (activePayrollSubTab) {
      case "YTD":
        amount = getSafeNumber(payrollYTDTotal);
        break;
      case "Pending":
        amount = getSafeNumber(expenseData?.pendingPayroll);
        break;
      case "Paid":
        amount = getSafeNumber(expenseData?.paidPayroll);
        break;
      case "Overdue":
        amount = getSafeNumber(expenseData?.overduePayroll);
        break;
      case "Unreceive_Payment":
        amount = getSafeNumber(expenseData?.unpaidPayroll);
        break;
      default:
        amount = getSafeNumber(totalPayroll);
    }
    return amount;
  };

  // **UPDATED**: getCurrentStockAmount uses activeStockSubTab to pick correct value
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
        const overdueAmount = getSafeNumber(
          invoice.overdueAmount ||
            (invoice.dueAmount > 0
              ? invoice.dueAmount
              : Math.max(
                  0,
                  getSafeNumber(invoice.totalAmount) -
                    getSafeNumber(invoice.paidAmount),
                )),
        );
        return sum + overdueAmount;
      }, 0);
    }
    return getSafeNumber(salesData?.overdueAmount);
  };

  const getCreditSaleCashNotReceived = () => {
    if (creditSaleTableData && creditSaleTableData.length > 0) {
      return creditSaleTableData.reduce((total, invoice) => {
        return (
          total + getSafeNumber(invoice.outstandingAmount || invoice.dueAmount)
        );
      }, 0);
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
        return activeSalesSubTab;
      case "Outstanding":
        return activeOutstandingSubTab;
      case "Total Expense":
        return activeExpenseSubTab;
      case "Total Payroll":
        return activePayrollSubTab;
      case "Stock in Hands":
        if (activeStockSubTab === "all") return "All Stock";
        if (activeStockSubTab === "mr") return "MR Stock";
        if (activeStockSubTab === "warehouse") return "Warehouse Stock";
        return activeStockSubTab;
      case "Overdue":
        return "Total Overdue";
      case "Pending Collection":
        return "Unreceive Payment";
      default:
        return "";
    }
  };

  // **FIXED**: Remove mapping for "Stock in Hands"
  const getActiveTabForCard = (cardTitle) => {
    const mapping = {
      "Total Sales": "Sales",
      "Total Expense": "Expenses",
      "Total Payroll": "Total Payroll",
      "Pending Collection": "Credit Sale Cash Not Receive",
      // "Stock in Hands" intentionally omitted → returns itself
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
      growth: getCurrentGrowth(),
    },
    {
      id: "Outstanding",
      title: "Outstanding",
      amount: getCurrentOutstandingAmount(),
      icon: TrendingUp,
      color: "orange",
      subtitle: getSubtitle("Outstanding"),
      growth: getCurrentOutstandingGrowth(),
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
  ];

  const firstRowCards = cards.slice(0, 4);
  const secondRowCards = cards.slice(4);

  return (
    <div className="space-y-6 mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {firstRowCards.map((card) => (
          <DashboardCard
            key={card.id}
            {...card}
            isActive={activeTab === getActiveTabForCard(card.title)}
            onClick={() => onTabChange(getActiveTabForCard(card.title))}
            onDateFilterClick={onDateFilterClick}
            onClearDateFilter={onClearDateFilter}
            isCustomDateActive={isCustomDateActive[card.title] || false}
            customDateRanges={customDateRanges}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {secondRowCards.map((card) => (
          <DashboardCard
            key={card.id}
            {...card}
            isActive={activeTab === getActiveTabForCard(card.title)}
            onClick={() => onTabChange(getActiveTabForCard(card.title))}
            onDateFilterClick={onDateFilterClick}
            onClearDateFilter={onClearDateFilter}
            isCustomDateActive={isCustomDateActive[card.title] || false}
            customDateRanges={customDateRanges}
          />
        ))}
        <div className="hidden lg:block"></div>
      </div>
    </div>
  );
};
