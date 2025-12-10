// DashboardCards.jsx
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
            ${formatCurrency(amount)}
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
  overdueTableData, // Add this prop
}) => {
  const getCurrentSalesAmount = () => {
    switch (activeSalesSubTab) {
      case "Today":
        return salesData?.todaySales || 0;
      case "Month":
        return salesData?.monthlySales || 0;
      case "Year":
        return salesData?.yearSales || 0;
      case "Credit_Sale":
        return salesData?.creditSale || 0;
      case "Pending":
        return salesData?.pendingSales || 0;
      case "Collected":
        return salesData?.collectedSales || 0;
      case "Overdue":
        return salesData?.overdueAmount || 0;
      case "Unreceive_Payment":
        return salesData?.unreceivePayment || 0;
      default:
        return salesData?.todaySales || 0;
    }
  };

  const getCurrentGrowth = () => {
    switch (activeSalesSubTab) {
      case "Today":
        return salesData?.todayGrowth || 0;
      case "Month":
        return salesData?.monthlyGrowth || 0;
      case "Year":
        return salesData?.yearGrowth || 0;
      case "Overdue":
        return salesData?.overdueGrowth || 0;
      case "Unreceive_Payment":
        return salesData?.unreceivePaymentGrowth || 0;
      default:
        return salesData?.todayGrowth || 0;
    }
  };

  const getCurrentOutstandingAmount = () => {
    switch (activeOutstandingSubTab) {
      case "Today":
        return outstandingData?.todayOutstanding || 0;
      case "Month":
        return outstandingData?.monthlyOutstanding || 0;
      case "Year":
        return outstandingData?.yearOutstanding || 0;
      case "30+ Days":
        return outstandingData?.thirtyPlusDays || 0;
      case "60+ Days":
        return outstandingData?.sixtyPlusDays || 0;
      case "90+ Days":
        return outstandingData?.ninetyPlusDays || 0;
      case "Overdue":
        return outstandingData?.overdueAmount || 0;
      case "Unreceive_Payment":
        return outstandingData?.unreceivePayment || 0;
      default:
        return outstandingData?.todayOutstanding || 0;
    }
  };

  const getCurrentOutstandingGrowth = () => {
    switch (activeOutstandingSubTab) {
      case "Today":
        return outstandingData?.todayGrowth || 0;
      case "Month":
        return outstandingData?.monthlyGrowth || 0;
      case "Year":
        return outstandingData?.yearGrowth || 0;
      case "Overdue":
        return outstandingData?.overdueGrowth || 0;
      case "Unreceive_Payment":
        return outstandingData?.unreceivePaymentGrowth || 0;
      default:
        return outstandingData?.todayGrowth || 0;
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
      (sum, expense) => sum + (expense.amount || 0),
      0
    );
  };

  const getCurrentPayrollAmount = () => {
    let amount = 0;

    switch (activePayrollSubTab) {
      case "Prev Month":
        amount = totalPayroll || 0;
        break;
      case "YTD":
        amount = payrollYTDTotal || 0;
        break;
      case "Pending":
        amount = expenseData?.pendingPayroll || 0;
        break;
      case "Paid":
        amount = expenseData?.paidPayroll || 0;
        break;
      case "Overdue":
        amount = expenseData?.overduePayroll || 0;
        break;
      case "Unreceive_Payment":
        amount = expenseData?.unpaidPayroll || 0;
        break;
      default:
        amount = totalPayroll || 0;
    }

    return amount;
  };

  const getCurrentStockAmount = () => {
    switch (activeStockSubTab) {
      case "Today":
        return stockData?.stockValue || 0;
      case "Low Stock":
        return stockData?.lowStockValue || 0;
      case "Expiring":
        return stockData?.expiringStockValue || 0;
      case "All":
        return stockData?.totalStockValue || 0;
      case "Overdue":
        return stockData?.overdueStockValue || 0;
      case "Unreceive_Payment":
        return stockData?.unreceivedStockValue || 0;
      default:
        return stockData?.stockValue || 0;
    }
  };

  // Get overdue amount using actual overdueTableData
  const getOverdueAmount = () => {
    if (overdueTableData && overdueTableData.length > 0) {
      // Calculate from actual overdue data
      return overdueTableData.reduce((sum, invoice) => {
        const overdueAmount =
          invoice.overdueAmount ||
          (invoice.dueAmount > 0
            ? invoice.dueAmount
            : Math.max(0, invoice.totalAmount - (invoice.paidAmount || 0)));
        return sum + overdueAmount;
      }, 0);
    }

    // Fallback to salesData.overdueAmount
    return salesData?.overdueAmount || 0;
  };

  // Get credit sale cash not received amount
  const getCreditSaleCashNotReceived = () => {
    return salesData?.unreceivePayment || salesData?.creditSale || 0;
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

      default:
        return "";
    }
  };

  // Cards array
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
      growth: 0,
    },
    {
      id: "Credit Sale Cash Not Receive",
      title: "Pending Collection",
      amount: getCreditSaleCashNotReceived(),
      icon: CreditCard,
      color: "indigo",
      subtitle: getSubtitle("Credit Sale Cash Not Receive"),
      growth: 0,
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
