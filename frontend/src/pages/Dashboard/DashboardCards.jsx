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
}) => (
  <div
    className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all ${
      isActive ? "bg-gray-200" : "bg-white"
    }`}
    onClick={onClick}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className={`text-2xl font-bold text-${color}-600 mt-2`}>
          ${formatCurrency(amount)}
        </p>
        {growth !== undefined && (
          <p className="text-xs text-gray-500 mt-1">
            {subtitle} •{" "}
            <span className={growth >= 0 ? "text-green-600" : "text-red-600"}>
              {growth >= 0 ? "↗" : "↘"} {growth.toFixed(1)}%
            </span>
          </p>
        )}
        {growth === undefined && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
      <div className={`p-3 bg-${color}-100 rounded-full`}>
        <Icon className={`w-6 h-6 text-${color}-600`} />
      </div>
    </div>
  </div>
);

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
  dateRanges,
  prevMonthRanges
}) => {

  // SALES CARD AMOUNT
  const getCurrentSalesAmount = () => {
    const subTab = activeTab === "Sales" ? activeSalesSubTab : "Today";
    switch (subTab) {
      case "Today": return salesData.todaySales || 0;
      case "Month": return salesData.monthlySales || 0;
      case "Year": return salesData.yearSales || 0;
      default: return salesData.todaySales || 0;
    }
  };

  const getCurrentGrowth = () => {
    const subTab = activeTab === "Sales" ? activeSalesSubTab : "Today";
    switch (subTab) {
      case "Today": return salesData.todayGrowth || 0;
      case "Month": return salesData.monthlyGrowth || 0;
      case "Year": return salesData.yearGrowth || 0;
      default: return salesData.todayGrowth || 0;
    }
  };

  // OUTSTANDING CARD AMOUNT
  const getCurrentOutstandingAmount = () => {
    const subTab = activeTab === "Outstanding" ? activeOutstandingSubTab : "Today";
    switch (subTab) {
      case "Today": return outstandingData.todayOutstanding || 0;
      case "Month": return outstandingData.monthlyOutstanding || 0;
      case "Year": return outstandingData.yearOutstanding || 0;
      default: return outstandingData.todayOutstanding || 0;
    }
  };

  const getCurrentOutstandingGrowth = () => {
    const subTab = activeTab === "Outstanding" ? activeOutstandingSubTab : "Today";
    switch (subTab) {
      case "Today": return outstandingData.todayGrowth || 0;
      case "Month": return outstandingData.monthlyGrowth || 0;
      case "Year": return outstandingData.yearGrowth || 0;
      default: return outstandingData.todayGrowth || 0;
    }
  };

  // EXPENSE CARD AMOUNT
  const getCurrentExpenseAmount = () => {
    const subTab = activeTab === "Expenses" ? activeExpenseSubTab : "Month";
    switch (subTab) {
      case "Month": return expenseData.monthlyExpense || 0;
      case "Year": return expenseData.yearExpense || 0;
      default: return expenseData.monthlyExpense || 0;
    }
  };

  // PAYROLL CARD AMOUNT
  const getCurrentPayrollAmount = () => {
    const subTab = activeTab === "Total Payroll" ? activePayrollSubTab : "Prev Month";
    switch (subTab) {
      case "Prev Month": return totalPayroll || 0;
      case "YTD": return payrollYTDTotal || 0;
      default: return totalPayroll || 0;
    }
  };

  const cards = [
    {
      id: "Sales",
      title: "Total Sales",
      amount: getCurrentSalesAmount(),
      icon: ShoppingCart,
      color: "blue",
      subtitle: activeTab === "Sales" ? activeSalesSubTab : "Today",
      growth: getCurrentGrowth(),
    },
    {
      id: "Outstanding",
      title: "Outstanding",
      amount: getCurrentOutstandingAmount(),
      icon: TrendingUp,
      color: "orange",
      subtitle: activeTab === "Outstanding" ? activeOutstandingSubTab : "Today",
      growth: getCurrentOutstandingGrowth(),
    },
    {
      id: "Stock in Hands",
      title: "Stock in Hands",
      amount: stockData.totalStock || 0,
      icon: Package,
      color: "green",
      subtitle: `${stockData.lowStockItems?.length || 0} low stock`,
    },
    {
      id: "Expense",
      title: "Total Expense",
      amount: getCurrentExpenseAmount(),
      icon: Receipt,
      color: "red",
      subtitle:
        activeTab === "Expenses"
          ? activeExpenseSubTab === "Month"
            ? dateRanges.month.label
            : dateRanges.year.rangeLabel
          : dateRanges.month.label,
    },
    {
      id: "Total Payroll",
      title: "Total Payroll",
      amount: getCurrentPayrollAmount(),
      icon: DollarSign,
      color: "purple",
      subtitle:
        activeTab === "Total Payroll"
          ? activePayrollSubTab === "Prev Month"
            ? prevMonthRanges.prevMonth.label
            : prevMonthRanges.prevMonthYear.label
          : prevMonthRanges.prevMonth.label,
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
