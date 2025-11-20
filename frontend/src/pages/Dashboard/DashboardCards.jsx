import React from "react";
import {
  ShoppingCart,
  TrendingUp,
  Package,
  Receipt,
  DollarSign,
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
  onClick 
}) => {
  const colorClasses = {
    blue: { text: "text-blue-600", bg: "bg-blue-100" },
    orange: { text: "text-orange-600", bg: "bg-orange-100" },
    green: { text: "text-green-600", bg: "bg-green-100" },
    red: { text: "text-red-600", bg: "bg-red-100" },
    purple: { text: "text-purple-600", bg: "bg-purple-100" }
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
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className={`text-2xl font-bold ${colors.text} mt-2`}>
            {formatCurrency(amount)}
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
        <div className={`p-3 ${colors.bg} rounded-full`}>
          <Icon className={`w-6 h-6 ${colors.text}`} />
        </div>
      </div>
    </div>
  );
};

export const DashboardCards = ({ 
  activeTab, 
  onTabChange,
  salesData = {},
  outstandingData = {},
  stockData = {},
  expenseData = {},
  totalPayroll = 0,
  payrollYTDTotal = 0,
  activeSalesSubTab,
  activeOutstandingSubTab,
  activeExpenseSubTab,
  activePayrollSubTab,
  dateRanges,
  prevMonthRanges
}) => {

  const getCurrentSalesAmount = () => {
    switch (activeSalesSubTab) {
      case "Today": return salesData.todaySales ?? 0;
      case "Month": return salesData.monthlySales ?? 0;
      case "Year": return salesData.yearSales ?? 0;
      default: return salesData.todaySales ?? 0;
    }
  };

  const getCurrentGrowth = () => {
    switch (activeSalesSubTab) {
      case "Today": return salesData.todayGrowth ?? 0;
      case "Month": return salesData.monthlyGrowth ?? 0;
      case "Year": return salesData.yearGrowth ?? 0;
      default: return salesData.todayGrowth ?? 0;
    }
  };

  const getCurrentOutstandingAmount = () => {
    switch (activeOutstandingSubTab) {
      case "Today": return outstandingData.todayOutstanding ?? 0;
      case "Month": return outstandingData.monthlyOutstanding ?? 0;
      case "Year": return outstandingData.yearOutstanding ?? 0;
      default: return outstandingData.todayOutstanding ?? 0;
    }
  };

  const getCurrentOutstandingGrowth = () => {
    switch (activeOutstandingSubTab) {
      case "Today": return outstandingData.todayGrowth ?? 0;
      case "Month": return outstandingData.monthlyGrowth ?? 0;
      case "Year": return outstandingData.yearGrowth ?? 0;
      default: return outstandingData.todayGrowth ?? 0;
    }
  };

  const getCurrentExpenseAmount = () => {
    switch (activeExpenseSubTab) {
      case "Month": return expenseData.monthlyExpense ?? 0;
      case "Year": return expenseData.yearExpense ?? 0;
      default: return expenseData.monthlyExpense ?? 0;
    }
  };

  const getCurrentPayrollAmount = () => {
    switch (activePayrollSubTab) {
      case "Prev Month": return totalPayroll ?? 0;
      case "YTD": return payrollYTDTotal ?? 0;
      default: return totalPayroll ?? 0;
    }
  };

  const getCurrentStockAmount = () => {
    return stockData.stockValue ?? 0;
  };

  const cards = [
    {
      id: "Sales",
      title: "Total Sales",
      amount: getCurrentSalesAmount(),
      icon: ShoppingCart,
      color: "blue",
      subtitle: activeSalesSubTab,
      growth: getCurrentGrowth(),
    },
    {
      id: "Outstanding",
      title: "Outstanding",
      amount: getCurrentOutstandingAmount(),
      icon: TrendingUp,
      color: "orange",
      subtitle: activeOutstandingSubTab,
      growth: getCurrentOutstandingGrowth(),
    },
    {
      id: "Stock in Hands",
      title: "Stock in Hands",
      amount: getCurrentStockAmount(),
      icon: Package,
      color: "green",
      subtitle: `${stockData.lowStockItems?.length ?? 0} low stock`,
    },
    {
      id: "Expenses",
      title: "Total Expense",
      amount: getCurrentExpenseAmount(),
      icon: Receipt,
      color: "red",
      subtitle:
        activeExpenseSubTab === "Month"
          ? dateRanges.month.label
          : dateRanges.year.rangeLabel,
    },
    {
      id: "Total Payroll",
      title: "Total Payroll",
      amount: getCurrentPayrollAmount(),
      icon: DollarSign,
      color: "purple",
      subtitle:
        activePayrollSubTab === "Prev Month"
          ? prevMonthRanges.prevMonth.label
          : prevMonthRanges.prevMonthYear.label,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
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
