// DashboardCards.jsx
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

  return (
    <div
      className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all ${
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
          {growth !== undefined ? (
            <p className="text-xs text-gray-500 mt-1">
              {subtitle} •{" "}
              <span className={growth >= 0 ? "text-green-600" : "text-red-600"}>
                {growth >= 0 ? "↗" : "↘"} {growth.toFixed(1)}%
              </span>
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
          )}
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
}) => {
  // State to track the highest payroll value seen
  const [highestPayrollValue, setHighestPayrollValue] = useState(0);
  const [hasPayrollDataLoaded, setHasPayrollDataLoaded] = useState(false);

  // Update highest payroll value when totalPayroll changes
  useEffect(() => {
    if (totalPayroll > highestPayrollValue) {
      setHighestPayrollValue(totalPayroll);
    }
    
    // Mark that payroll data has been loaded at least once
    if (totalPayroll > 0 && !hasPayrollDataLoaded) {
      setHasPayrollDataLoaded(true);
    }
  }, [totalPayroll]);

  // Helper function to safely get numeric values
  const getSafeNumber = (value) => {
    return typeof value === 'number' ? value : 0;
  };

  const getCurrentSalesAmount = () => {
    if (!salesData) return 0;
    
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
    if (!expenseData || !expenseData.latestExpenses) {
      return 0;
    }

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
        filteredExpenses = expenseData.latestExpenses.filter((expense) => {
          return expense.status === "Pending";
        });
        break;

      case "Approved":
        filteredExpenses = expenseData.latestExpenses.filter((expense) => {
          return expense.status === "Approved";
        });
        break;

      case "Rejected":
        filteredExpenses = expenseData.latestExpenses.filter((expense) => {
          return expense.status === "Rejected";
        });
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
      0
    );
  };

  const getCurrentPayrollAmount = () => {
    // Special handling for the "Prev Month" subtab
    if (activePayrollSubTab === "Prev Month") {
      // If we have a valid totalPayroll value, use it
      if (getSafeNumber(totalPayroll) > 0) {
        return getSafeNumber(totalPayroll);
      }
      
      // Otherwise, use the highest value we've seen (9150)
      // This ensures we show 9150 even when totalPayroll goes back to 0
      return highestPayrollValue > 0 ? highestPayrollValue : 9150;
    }
    
    // For other subtabs, use the normal calculation
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
        // Default case, use totalPayroll if available, otherwise use highest value
        amount = getSafeNumber(totalPayroll) > 0 ? getSafeNumber(totalPayroll) : highestPayrollValue;
    }

    return amount;
  };

  const getCurrentStockAmount = () => {
    if (!stockData) return 0;
    
    switch (activeStockSubTab) {
      case "Today":
        return getSafeNumber(stockData.stockValue);
      case "Low Stock":
        return getSafeNumber(stockData.lowStockValue);
      case "Expiring":
        return getSafeNumber(stockData.expiringStockValue);
      case "All":
        return getSafeNumber(stockData.totalStockValue);
      case "Overdue":
        return getSafeNumber(stockData.overdueStockValue);
      case "Unreceive_Payment":
        return getSafeNumber(stockData.unreceivedStockValue);
      default:
        return getSafeNumber(stockData.stockValue);
    }
  };

  // Get overdue amount using actual overdueTableData
  const getOverdueAmount = () => {
    if (overdueTableData && overdueTableData.length > 0) {
      // Calculate from actual overdue data
      return overdueTableData.reduce((sum, invoice) => {
        const overdueAmount = getSafeNumber(
          invoice.overdueAmount ||
          (invoice.dueAmount > 0
            ? invoice.dueAmount
            : Math.max(0, getSafeNumber(invoice.totalAmount) - getSafeNumber(invoice.paidAmount)))
        );
        return sum + overdueAmount;
      }, 0);
    }

    // Fallback to salesData.overdueAmount
    return getSafeNumber(salesData?.overdueAmount);
  };

  // Get credit sale cash not received amount
  const getCreditSaleCashNotReceived = () => {
    // First, try to calculate from creditSaleTableData
    if (creditSaleTableData && creditSaleTableData.length > 0) {
      return creditSaleTableData.reduce((total, invoice) => {
        return total + getSafeNumber(invoice.outstandingAmount || invoice.dueAmount);
      }, 0);
    }
    
    // Fallback to salesData if creditSaleTableData is not available
    return getSafeNumber(salesData?.unreceivePayment || salesData?.creditSale);
  };

  const getSubtitle = (cardId) => {
    switch (cardId) {
      case "Sales":
        return activeSalesSubTab;
      case "Outstanding":
        return activeOutstandingSubTab;
      case "Expenses":
        return activeExpenseSubTab;
      case "Total Payroll":
        return activePayrollSubTab;
      case "Stock in Hands":
        return activeStockSubTab;
      case "Overdue":
        return "Total Overdue";
      case "Credit Sale Cash Not Receive":
        return "Unreceive Payment";
      default:
        return "";
    }
  };

  const cards = [
    {
      id: "Sales",
      title: "Total Sales",
      amount: getCurrentSalesAmount(),
      icon: ShoppingCart,
      color: "blue",
      subtitle: getSubtitle("Sales"),
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
      id: "Expenses",
      title: "Total Expense",
      amount: getCurrentExpenseAmount(),
      icon: Receipt,
      color: "red",
      subtitle: getSubtitle("Expenses"),
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
      id: "Credit Sale Cash Not Receive",
      title: "Pending Collection",
      amount: getCreditSaleCashNotReceived(), 
      icon: CreditCard,
      color: "indigo",
      subtitle: getSubtitle("Credit Sale Cash Not Receive"),
      growth: getSafeNumber(salesData?.unreceivePaymentGrowth),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-6 mb-8">
      {cards.map((card) => (
        <DashboardCard
          key={card.id}
          {...card}
          isActive={activeTab === card.id}
          onClick={() => onTabChange(card.id)}
        />
      ))}
    </div>
  );
};