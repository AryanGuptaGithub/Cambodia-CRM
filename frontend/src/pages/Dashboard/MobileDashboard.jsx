import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDashboardData } from "./useDataboardData";
import {
  formatCurrency,
  getDateRanges,
  getPreviousMonthRanges,
} from "./DashboardUtil";
import axios from "axios";
import {
  ShoppingCart,
  TrendingUp,
  Package,
  DollarSign,
  AlertCircle,
  CreditCard,
  AlertTriangle,
  Menu,
  Eye,
  Building2,
  Receipt,
  Users,
  Calendar,
  Clock,
  Filter,
} from "lucide-react";
import { SalesTable } from "./SalesTable";
import { PayrollTable } from "./PayrollTable";
import { ExpenseTable } from "./ExpenseTable";
import { CombinedStockTable } from "./StockTable";
import { OverdueTable } from "./OverdueTable";
import { CreditSaleTable } from "./CreditSaleTable";
import Sidebar from "../../components/Sidebar";
import { CompanyBalancePanel } from "./MobileLayout/CompanyBalancePanel";
import ProductsModal from "./ProductModal";
import { formatDateToReadable } from "../../utils/dateUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "";
const safe = (v) => (typeof v === "number" ? v : 0);

// --------------------------------------------------------------
// MiniRecentSales
// --------------------------------------------------------------
const MiniRecentSales = ({
  salesTableData = [],
  loadingSalesData = false,
  onViewProducts,
}) => {
  const topMRs = useMemo(() => {
    const mrGroups = {};
    salesTableData.forEach((sale) => {
      const key = sale.salesPerson || sale.mrName || "Unknown";
      if (!mrGroups[key])
        mrGroups[key] = {
          mrName: key,
          totalAmount: 0,
          productCount: 0,
          products: [],
        };
      mrGroups[key].totalAmount += sale.amount || 0;
      mrGroups[key].productCount += 1;
      mrGroups[key].products.push(sale);
    });
    return Object.values(mrGroups)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);
  }, [salesTableData]);

  if (loadingSalesData)
    return <p className="text-gray-500 text-center py-3 text-sm">Loading...</p>;
  if (!topMRs.length)
    return (
      <p className="text-gray-500 text-center py-3 text-sm">
        No sales data found
      </p>
    );

  return (
    <div className="space-y-2">
      {topMRs.map((mr, i) => (
        <div
          key={mr.mrName}
          className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-semibold">
              {i + 1}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">{mr.mrName}</p>
              <p className="text-xs text-gray-500">
                {mr.productCount} product{mr.productCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-green-600">
              ${formatCurrency(mr.totalAmount)}
            </p>
            {onViewProducts && (
              <button
                onClick={() => onViewProducts(mr.mrName, mr.products)}
                className="text-gray-400 hover:text-blue-600 p-1"
              >
                <ShoppingCart size={15} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// --------------------------------------------------------------
// MiniRecentExpenses
// --------------------------------------------------------------
const MiniRecentExpenses = ({
  expenseTableData = [],
  loadingExpenseData = false,
}) => {
  const highest = useMemo(() => {
    if (!expenseTableData.length) return null;
    return expenseTableData.reduce(
      (m, e) => (e.amount > m.amount ? e : m),
      expenseTableData[0],
    );
  }, [expenseTableData]);

  const top5 = expenseTableData.slice(0, 5);

  if (loadingExpenseData)
    return (
      <p className="text-gray-500 text-center py-3 text-sm">
        Loading expenses...
      </p>
    );
  if (!top5.length)
    return (
      <p className="text-gray-500 text-center py-3 text-sm">
        No expense data available
      </p>
    );

  return (
    <div className="space-y-2">
      {highest && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600">
                <TrendingUp size={13} />
              </div>
              <div>
                <p className="text-xs font-medium text-yellow-800">
                  Highest Expense
                </p>
                <p className="text-xs text-yellow-600">
                  {highest.category || "Uncategorized"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-yellow-700">
                ${formatCurrency(highest.amount)}
              </p>
              <p className="text-xs text-yellow-600">
                {formatDateToReadable(highest.date) || "No date"}
              </p>
            </div>
          </div>
        </div>
      )}
      {top5.map((item, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-xs font-semibold">
              {i + 1}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">
                {item.category || "Uncategorized"}
              </p>
              <p className="text-xs text-gray-500">
                {item.remarks || "No description"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-red-700">
              ${formatCurrency(item.amount)}
            </p>
            <p className="text-xs text-gray-500">
              {formatDateToReadable(item.date) || ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

// --------------------------------------------------------------
// MiniRecentOverdue
// --------------------------------------------------------------
const MiniRecentOverdue = ({
  overdueTableData = [],
  loadingOverdueData = false,
}) => {
  const top5 = useMemo(() => {
    if (!overdueTableData.length) return [];
    return [...overdueTableData]
      .sort((a, b) => {
        const amtA =
          a.overdueAmount ||
          (a.dueAmount > 0
            ? a.dueAmount
            : Math.max(0, a.totalAmount - (a.paidAmount || 0)));
        const amtB =
          b.overdueAmount ||
          (b.dueAmount > 0
            ? b.dueAmount
            : Math.max(0, b.totalAmount - (b.paidAmount || 0)));
        return amtB - amtA;
      })
      .slice(0, 5);
  }, [overdueTableData]);

  const totalOverdue = useMemo(
    () =>
      overdueTableData.reduce((sum, inv) => {
        const amt =
          inv.overdueAmount ||
          (inv.dueAmount > 0
            ? inv.dueAmount
            : Math.max(0, inv.totalAmount - (inv.paidAmount || 0)));
        return sum + amt;
      }, 0),
    [overdueTableData],
  );

  if (loadingOverdueData)
    return (
      <p className="text-gray-500 text-center py-3 text-sm">
        Loading overdue invoices...
      </p>
    );
  if (!top5.length)
    return (
      <p className="text-gray-500 text-center py-3 text-sm">
        No overdue invoices found
      </p>
    );

  return (
    <div className="space-y-2">
      {totalOverdue > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                <AlertCircle size={13} />
              </div>
              <div>
                <p className="text-xs font-medium text-red-800">
                  Total Overdue
                </p>
                <p className="text-xs text-red-600">
                  {overdueTableData.length} invoice
                  {overdueTableData.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-red-700">
                ${formatCurrency(totalOverdue)}
              </p>
              <p className="text-xs text-red-600">Highest priority</p>
            </div>
          </div>
        </div>
      )}
      {top5.map((item, i) => {
        const daysOverdue = Math.max(
          0,
          Math.floor(
            (new Date() - new Date(item.dueDate)) / (1000 * 60 * 60 * 24),
          ),
        );
        const overdueAmt =
          item.overdueAmount ||
          (item.dueAmount > 0
            ? item.dueAmount
            : Math.max(0, item.totalAmount - (item.paidAmount || 0)));
        return (
          <div
            key={i}
            className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-xs font-semibold">
                {i + 1}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {item.customerName || "No customer"}
                </p>
                <p className="text-xs text-gray-500">
                  {item.invoiceNumber || "No invoice#"} ·{" "}
                  {item.mrName || "No MR"}
                </p>
                <span
                  className={`inline-block px-2 py-0.5 mt-1 text-xs rounded-full ${daysOverdue > 90 ? "bg-red-100 text-red-800" : daysOverdue > 60 ? "bg-orange-100 text-orange-800" : daysOverdue > 30 ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800"}`}
                >
                  {daysOverdue} days overdue
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-red-700">
                ${formatCurrency(overdueAmt)}
              </p>
              <p className="text-xs text-gray-500">
                Due: {formatDateToReadable(item.dueDate)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// --------------------------------------------------------------
// MiniLowStock
// --------------------------------------------------------------
const MiniLowStock = ({ stockData = {} }) => {
  const items = stockData.lowStockItems?.slice(0, 5) || [];
  if (!items.length)
    return (
      <p className="text-gray-500 text-center py-3 text-sm">
        No low stock items
      </p>
    );
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center text-red-600">
              <AlertTriangle size={13} />
            </div>
            <p className="text-sm font-medium text-gray-800">
              {item.productName}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-red-700">
              {item.quantity?.boxes}
            </p>
            <p className="text-xs text-gray-500">Min: {item.minStockLevel}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// --------------------------------------------------------------
// MiniRecentJoins
// --------------------------------------------------------------
const MiniRecentJoins = ({ mrList = [] }) => {
  const recent = useMemo(
    () =>
      [...mrList]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5),
    [mrList],
  );
  if (!recent.length)
    return (
      <p className="text-gray-500 text-center py-3 text-sm">
        No recent activity
      </p>
    );
  return (
    <div className="space-y-2">
      {recent.map((mr, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-semibold">
              {mr.medicalRepName?.substring(0, 2).toUpperCase() || "MR"}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800 capitalize">
                {mr.medicalRepName}
              </p>
              <p className="text-xs text-gray-500">{mr.teamName}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">
              {formatDateToReadable(mr.date)}
            </p>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs ${mr.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
            >
              {mr.isActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

// --------------------------------------------------------------
// MiniCreditSalePanel
// --------------------------------------------------------------
const MiniCreditSalePanel = ({
  creditSaleData = [],
  loadingCreditSaleData = false,
}) => {
  const totalAmt = useMemo(
    () =>
      creditSaleData.reduce(
        (s, inv) =>
          s + safe(inv.dueAmount || inv.totalAmount - (inv.paidAmount || 0)),
        0,
      ),
    [creditSaleData],
  );

  if (loadingCreditSaleData)
    return <p className="text-gray-500 text-center py-3 text-sm">Loading...</p>;
  if (!creditSaleData.length)
    return (
      <p className="text-gray-500 text-center py-3 text-sm">
        No credit sale data
      </p>
    );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs font-medium text-red-800 mb-1">Outstanding</p>
          <p className="text-sm font-bold text-red-700">
            ${formatCurrency(totalAmt)}
          </p>
          <p className="text-xs text-red-600">
            {creditSaleData.length} invoice
            {creditSaleData.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs font-medium text-blue-800 mb-1">
            Total Invoices
          </p>
          <p className="text-sm font-bold text-blue-700">
            {creditSaleData.length}
          </p>
          <p className="text-xs text-blue-600">Credit not received</p>
        </div>
      </div>
      {creditSaleData.slice(0, 5).map((item, i) => {
        const outstanding =
          item.dueAmount ||
          Math.max(0, item.totalAmount - (item.paidAmount || 0));
        return (
          <div
            key={i}
            className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg border border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-semibold">
                {i + 1}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800 truncate max-w-[130px]">
                  {item.customerName || "No customer"}
                </p>
                <p className="text-xs text-gray-500">
                  {item.invoiceNumber || "No invoice#"} ·{" "}
                  {item.mrName || "No MR"}
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold text-red-600">
              ${formatCurrency(outstanding)}
            </p>
          </div>
        );
      })}
    </div>
  );
};

// --------------------------------------------------------------
// MiniCompanyBalance
// --------------------------------------------------------------
const MiniCompanyBalance = ({
  companyBalanceAccounts = [],
  loadingCompanyBalance = false,
}) => {
  const totalBalance = companyBalanceAccounts.reduce(
    (s, a) => s + (a.totalAmount || 0),
    0,
  );
  const colours = [
    {
      bg: "bg-blue-100",
      text: "text-blue-600",
      amount: "text-blue-700",
      border: "border-blue-200",
      pill: "bg-blue-50",
    },
    {
      bg: "bg-purple-100",
      text: "text-purple-600",
      amount: "text-purple-700",
      border: "border-purple-200",
      pill: "bg-purple-50",
    },
    {
      bg: "bg-green-100",
      text: "text-green-600",
      amount: "text-green-700",
      border: "border-green-200",
      pill: "bg-green-50",
    },
    {
      bg: "bg-orange-100",
      text: "text-orange-600",
      amount: "text-orange-700",
      border: "border-orange-200",
      pill: "bg-orange-50",
    },
  ];

  if (loadingCompanyBalance)
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  if (!companyBalanceAccounts.length)
    return (
      <p className="text-gray-500 text-center py-3 text-sm">
        No account data found
      </p>
    );

  return (
    <div className="space-y-2">
      <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-teal-100 rounded-full flex items-center justify-center text-teal-600">
              <Building2 size={13} />
            </div>
            <div>
              <p className="text-xs font-medium text-teal-800">Total Balance</p>
              <p className="text-xs text-teal-600">
                {companyBalanceAccounts.length} account
                {companyBalanceAccounts.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <p className="text-sm font-bold text-teal-700">
            ${formatCurrency(totalBalance)}
          </p>
        </div>
      </div>
      {companyBalanceAccounts.map((acc, i) => {
        const c = colours[i % colours.length];
        return (
          <div
            key={String(acc._id || i)}
            className={`flex items-center justify-between p-3 rounded-lg border ${c.border} ${c.pill}`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-7 h-7 ${c.bg} rounded-full flex items-center justify-center ${c.text} text-xs font-semibold`}
              >
                {acc.name?.substring(0, 2).toUpperCase() || "AC"}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{acc.name}</p>
                <p className="text-xs text-gray-500">
                  {acc.transactionCount} transaction
                  {acc.transactionCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${c.amount}`}>
                ${formatCurrency(acc.totalAmount || 0)}
              </p>
              {acc.code && <p className="text-xs text-gray-400">{acc.code}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// --------------------------------------------------------------
// MobileSidePanel
// --------------------------------------------------------------
const MobileSidePanel = ({
  activeTable,
  salesTableData,
  loadingSalesData,
  expenseTableData,
  loadingExpenseData,
  overdueTableData,
  loadingOverdueData,
  creditSaleTableData,
  loadingCreditSaleData,
  stockData,
  mrList,
  companyBalanceAccounts,
  loadingCompanyBalance,
  onViewProducts,
}) => {
  const config = {
    Sales: { title: "Highest Sales by MR", icon: Users },
    Expenses: { title: "Latest Expenses", icon: Receipt },
    "Total Payroll": { title: "Recent Joins", icon: Calendar },
    "Stock in Hands": { title: "Low Stock Items", icon: AlertTriangle },
    Overdue: { title: "Highest Overdue Amount", icon: AlertCircle },
    "Credit Sale Cash Not Receive": {
      title: "Credit Sales (Cash Not Received)",
      icon: CreditCard,
    },
    "Company Balance": { title: "Account Balances", icon: Building2 },
  };

  const current = config[activeTable];
  if (!current) return null;

  const renderContent = () => {
    switch (activeTable) {
      case "Sales":
        return (
          <MiniRecentSales
            salesTableData={salesTableData}
            loadingSalesData={loadingSalesData}
            onViewProducts={onViewProducts}
          />
        );
      case "Expenses":
        return (
          <MiniRecentExpenses
            expenseTableData={expenseTableData}
            loadingExpenseData={loadingExpenseData}
          />
        );
      case "Total Payroll":
        return <MiniRecentJoins mrList={mrList} />;
      case "Stock in Hands":
        return <MiniLowStock stockData={stockData} />;
      case "Overdue":
        return (
          <MiniRecentOverdue
            overdueTableData={overdueTableData}
            loadingOverdueData={loadingOverdueData}
          />
        );
      case "Credit Sale Cash Not Receive":
        return (
          <MiniCreditSalePanel
            creditSaleData={creditSaleTableData}
            loadingCreditSaleData={loadingCreditSaleData}
          />
        );
      case "Company Balance":
        return (
          <MiniCompanyBalance
            companyBalanceAccounts={companyBalanceAccounts}
            loadingCompanyBalance={loadingCompanyBalance}
          />
        );
      default:
        return null;
    }
  };

  const Icon = current.icon;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className="text-gray-500" />
        <h4 className="text-sm font-semibold text-gray-800">{current.title}</h4>
      </div>
      {renderContent()}
    </div>
  );
};

// --------------------------------------------------------------
// MAIN MOBILE DASHBOARD (with reduced header size)
// --------------------------------------------------------------
const MobileDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { stockData, totalPayroll, mrList } = useDashboardData();

  // Data state
  const [todaySales, setTodaySales] = useState(0);
  const [monthlySales, setMonthlySales] = useState(0);
  const [companyBalance, setCompanyBalance] = useState(0);
  const [overdueTotal, setOverdueTotal] = useState(0);
  const [creditSaleTotal, setCreditSaleTotal] = useState(0);
  const [monthlyExpense, setMonthlyExpense] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);
  const [username, setUsername] = useState("User");

  // UI state
  const [activeTable, setActiveTable] = useState("Sales");
  const [activeCardKey, setActiveCardKey] = useState("totalSales");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);

  // Table data
  const [salesTableData, setSalesTableData] = useState([]);
  const [loadingSalesData, setLoadingSalesData] = useState(false);
  const [activeSalesSubTab, setActiveSalesSubTab] = useState("Today");

  const [expenseTableData, setExpenseTableData] = useState([]);
  const [loadingExpenseData, setLoadingExpenseData] = useState(false);
  const [activeExpenseSubTab, setActiveExpenseSubTab] = useState("Month");

  const [payrollTableData, setPayrollTableData] = useState([]);
  const [loadingPayrollData, setLoadingPayrollData] = useState(false);
  const [activePayrollSubTab, setActivePayrollSubTab] = useState("Prev Month");
  const [currentPayrollTotal, setCurrentPayrollTotal] = useState(0);

  const [overdueTableData, setOverdueTableData] = useState([]);
  const [loadingOverdueData, setLoadingOverdueData] = useState(false);

  const [creditSaleTableData, setCreditSaleTableData] = useState([]);
  const [loadingCreditSaleData, setLoadingCreditSaleData] = useState(false);
  const [activeCreditSubTab, setActiveCreditSubTab] = useState("Month");

  const [activeStockSubTab, setActiveStockSubTab] = useState("all");

  const [companyBalanceAccounts, setCompanyBalanceAccounts] = useState([]);
  const [loadingCompanyBalance, setLoadingCompanyBalance] = useState(false);

  // Modal
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [selectedMRName, setSelectedMRName] = useState("");
  const [selectedMRProducts, setSelectedMRProducts] = useState([]);

  const dateRanges = getDateRanges();
  const prevMonthRanges = getPreviousMonthRanges();
  const currentMonthName = new Date().toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const outOfStockCount = stockData?.outOfStockCount ?? 0;

  // Mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Body scroll lock when sidebar is open on mobile
  useEffect(() => {
    if (isMobileView && sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileView, sidebarOpen]);

  useEffect(() => {
    if (isMobileView && sidebarOpen) setSidebarOpen(false);
  }, [location.pathname, isMobileView]);

  // Initial fetch
  useEffect(() => {
    const init = async () => {
      setDataLoading(true);
      try {
        setUsername(localStorage.getItem("username") || "User");
        const [
          salesRes,
          monthRes,
          balanceRes,
          overdueRes,
          creditRes,
          expenseMonthRes,
        ] = await Promise.allSettled([
          axios.get(`${backendUrl}/api/sales/table-data`, {
            params: { period: "Today" },
          }),
          axios.get(`${backendUrl}/api/sales/table-data`, {
            params: { period: "Month" },
          }),
          axios.get(`${backendUrl}/api/accounts/balance`),
          axios.get(`${backendUrl}/api/overdue`, {
            params: { currentDate: new Date().toISOString() },
          }),
          axios.get(`${backendUrl}/api/sales/credit-sale-not-received`, {
            params: { period: "month" },
          }),
          axios.get(`${backendUrl}/api/expenses`, {
            params: { period: "Month" },
          }),
        ]);

        if (salesRes.status === "fulfilled" && salesRes.value.data?.success)
          setTodaySales(
            (salesRes.value.data.data || []).reduce(
              (s, x) => s + safe(x.amount),
              0,
            ),
          );
        if (monthRes.status === "fulfilled" && monthRes.value.data?.success)
          setMonthlySales(
            (monthRes.value.data.data || []).reduce(
              (s, x) => s + safe(x.amount),
              0,
            ),
          );
        if (
          balanceRes.status === "fulfilled" &&
          balanceRes.value.data?.success
        ) {
          setCompanyBalance(balanceRes.value.data.totalBalance || 0);
          setCompanyBalanceAccounts(
            (balanceRes.value.data.accounts || []).map((a) => ({
              ...a,
              transactions: a.transactions || [],
            })),
          );
        }
        if (overdueRes.status === "fulfilled" && overdueRes.value.data?.success)
          setOverdueTotal(
            (overdueRes.value.data.data || []).reduce(
              (s, x) => s + safe(x.dueAmount || x.overdueAmount),
              0,
            ),
          );
        if (creditRes.status === "fulfilled" && creditRes.value.data?.success)
          setCreditSaleTotal(parseFloat(creditRes.value.data.totalAmount) || 0);
        if (expenseMonthRes.status === "fulfilled")
          setMonthlyExpense(
            (expenseMonthRes.value.data.data || []).reduce(
              (sum, ex) => sum + safe(ex.amount),
              0,
            ),
          );

        fetchSalesData("Today");
      } catch (err) {
        console.error("MobileDashboard init error:", err);
      } finally {
        setDataLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    setCurrentPayrollTotal(totalPayroll || 0);
  }, [totalPayroll]);

  // Fetchers
  const fetchSalesData = async (period = "Today") => {
    try {
      setLoadingSalesData(true);
      const res = await axios.get(`${backendUrl}/api/sales/table-data`, {
        params: { period },
      });
      setSalesTableData(res.data.success ? res.data.data : []);
    } catch {
      setSalesTableData([]);
    } finally {
      setLoadingSalesData(false);
    }
  };

  const fetchExpenseData = async (period = "Month") => {
    try {
      setLoadingExpenseData(true);
      const res = await axios.get(`${backendUrl}/api/expenses`, {
        params: { period },
      });
      const raw = res.data.data || [];
      setExpenseTableData(
        raw.map((ex) => ({
          ...ex,
          category: ex.category?.category || ex.category || "Unknown",
        })),
      );
    } catch {
      setExpenseTableData([]);
    } finally {
      setLoadingExpenseData(false);
    }
  };

  const fetchPayrollData = async (period = "Prev Month") => {
    try {
      setLoadingPayrollData(true);
      let params = {};
      const cur = new Date();
      if (period === "Prev Month") {
        let pm = cur.getMonth() - 1,
          y = cur.getFullYear();
        if (pm < 0) {
          pm = 11;
          y--;
        }
        params.period = `${y}-${String(pm + 1).padStart(2, "0")}`;
      } else if (period === "YTD") {
        params.period = `${cur.getFullYear()}-YTD`;
      }
      const res = await axios.get(`${backendUrl}/api/hrm/payroll`, { params });
      const payrolls = res.data?.data || [];
      setPayrollTableData(payrolls);
      setCurrentPayrollTotal(
        payrolls.reduce((s, i) => s + (i.netSalary || 0), 0),
      );
    } catch {
      setPayrollTableData([]);
    } finally {
      setLoadingPayrollData(false);
    }
  };

  const fetchOverdueData = async () => {
    try {
      setLoadingOverdueData(true);
      const res = await axios.get(`${backendUrl}/api/overdue`, {
        params: { currentDate: new Date().toISOString() },
      });
      if (res.data.success)
        setOverdueTableData(
          res.data.data.map((inv) => ({
            ...inv,
            overdueAmount:
              inv.dueAmount > 0
                ? inv.dueAmount
                : Math.max(0, inv.totalAmount - (inv.paidAmount || 0)),
          })),
        );
    } catch {
      setOverdueTableData([]);
    } finally {
      setLoadingOverdueData(false);
    }
  };

  const fetchCreditSaleData = async (period = "Month") => {
    try {
      setLoadingCreditSaleData(true);
      const bp = { Today: "today", Month: "month", Year: "year" }[period];
      const res = await axios.get(
        `${backendUrl}/api/sales/credit-sale-not-received`,
        { params: bp ? { period: bp } : {} },
      );
      if (res.data.success) {
        setCreditSaleTableData(res.data.data || []);
        setCreditSaleTotal(parseFloat(res.data.totalAmount) || 0);
      }
    } catch {
      setCreditSaleTableData([]);
    } finally {
      setLoadingCreditSaleData(false);
    }
  };

  const fetchCompanyBalance = async () => {
    try {
      setLoadingCompanyBalance(true);
      const res = await axios.get(`${backendUrl}/api/accounts/balance`);
      if (res.data.success) {
        setCompanyBalance(res.data.totalBalance || 0);
        setCompanyBalanceAccounts(
          (res.data.accounts || []).map((a) => ({
            ...a,
            transactions: a.transactions || [],
          })),
        );
      }
    } catch {
      setCompanyBalanceAccounts([]);
    } finally {
      setLoadingCompanyBalance(false);
    }
  };

  // Handlers
  const handleViewProducts = (mrName, products) => {
    setSelectedMRName(mrName);
    setSelectedMRProducts(products);
    setShowProductsModal(true);
  };

  const handleCardClick = (tableName, cardKey) => {
    setActiveTable(tableName);
    setActiveCardKey(cardKey);

    if (tableName === "Sales") {
      const sub = cardKey === "currentMonthSale" ? "Month" : "Today";
      setActiveSalesSubTab(sub);
      fetchSalesData(sub);
      return;
    }
    switch (tableName) {
      case "Expenses":
        setActiveExpenseSubTab("Month");
        fetchExpenseData("Month");
        break;
      case "Total Payroll":
        setActivePayrollSubTab("Prev Month");
        fetchPayrollData("Prev Month");
        break;
      case "Overdue":
        fetchOverdueData();
        break;
      case "Credit Sale Cash Not Receive":
        setActiveCreditSubTab("Month");
        fetchCreditSaleData("Month");
        break;
      case "Stock in Hands":
        setActiveStockSubTab("all");
        break;
      case "Company Balance":
        fetchCompanyBalance();
        break;
    }
  };

  // Sub-tab pills
  const SubTabs = ({ tabs, active, onChange }) => (
    <div className="flex gap-2 mb-1 overflow-x-auto no-scrollbar pb-1">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${active === t ? "bg-blue-600 text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200"}`}
        >
          {t}
        </button>
      ))}
    </div>
  );

  // Table renderer
  const renderTable = () => {
    switch (activeTable) {
      case "Sales":
        return (
          <>
            {activeCardKey === "currentMonthSale" ? (
              <div className="mb-4 text-sm font-medium text-gray-600">
                {currentMonthName}
              </div>
            ) : (
              <SubTabs
                tabs={["Today", "Month", "Year", "All"]}
                active={activeSalesSubTab}
                onChange={(t) => {
                  setActiveSalesSubTab(t);
                  fetchSalesData(t);
                }}
              />
            )}
            <SalesTable
              salesTableData={salesTableData}
              loadingSalesData={loadingSalesData}
              activeSalesSubTab={activeSalesSubTab}
              dateRanges={dateRanges}
              prevMonthRanges={prevMonthRanges}
              onViewProducts={handleViewProducts}
            />
          </>
        );
      case "Expenses":
        return (
          <>
            <SubTabs
              tabs={["Month", "Year", "All"]}
              active={activeExpenseSubTab}
              onChange={(t) => {
                setActiveExpenseSubTab(t);
                fetchExpenseData(t);
              }}
            />
            <ExpenseTable
              expenseTableData={expenseTableData}
              loadingExpenseData={loadingExpenseData}
              activeExpenseSubTab={activeExpenseSubTab}
              dateRanges={dateRanges}
              onViewExpenseDetails={() => {}}
            />
          </>
        );
      case "Total Payroll":
        return (
          <>
            <SubTabs
              tabs={["Prev Month", "YTD"]}
              active={activePayrollSubTab}
              onChange={(t) => {
                setActivePayrollSubTab(t);
                fetchPayrollData(t);
              }}
            />
            <PayrollTable
              payrollData={payrollTableData}
              loading={loadingPayrollData}
              activePayrollSubTab={activePayrollSubTab}
              prevMonthRanges={prevMonthRanges}
            />
          </>
        );
      case "Stock in Hands":
        return (
          <CombinedStockTable
            apiBaseUrl={backendUrl}
            activeTab={activeStockSubTab}
            onTabChange={setActiveStockSubTab}
          />
        );
      case "Overdue":
        return (
          <OverdueTable
            overdueData={overdueTableData}
            loading={loadingOverdueData}
            onViewDetails={() => {}}
          />
        );
      case "Credit Sale Cash Not Receive":
        return (
          <>
            <SubTabs
              tabs={["Today", "Month", "Year"]}
              active={activeCreditSubTab}
              onChange={(t) => {
                setActiveCreditSubTab(t);
                fetchCreditSaleData(t);
              }}
            />
            <CreditSaleTable
              creditSaleData={creditSaleTableData}
              loading={loadingCreditSaleData}
              onViewDetails={() => {}}
              activePendingCollectionSubTab={activeCreditSubTab}
            />
          </>
        );
      case "Company Balance":
        return <CompanyBalancePanel />;
      default:
        return (
          <div className="p-6 text-center text-gray-400 text-sm">
            No data for "{activeTable}"
          </div>
        );
    }
  };

  const cards = [
    {
      key: "totalSales",
      table: "Sales",
      label: "Total Sales",
      value: todaySales,
      icon: ShoppingCart,
      color: "#2563EB",
    },
    {
      key: "currentMonthSale",
      table: "Sales",
      label: "Current Month Sale",
      value: monthlySales,
      icon: TrendingUp,
      color: "#EA580C",
    },
    {
      key: "stock",
      table: "Stock in Hands",
      label: "Stock in Hands",
      value: stockData?.totalStockValue || 0,
      icon: Package,
      color: "#0D9488",
    },
    {
      key: "expense",
      table: "Expenses",
      label: "Total Expense",
      value: monthlyExpense,
      icon: DollarSign,
      color: "#9333EA",
    },
    {
      key: "payroll",
      table: "Total Payroll",
      label: "Total Payroll",
      value: currentPayrollTotal,
      icon: DollarSign,
      color: "#2563EB",
    },
    {
      key: "overdue",
      table: "Overdue",
      label: "Overdue",
      value: overdueTotal,
      icon: AlertCircle,
      color: "#DC2626",
    },
    {
      key: "pending",
      table: "Credit Sale Cash Not Receive",
      label: "Pending Collection",
      value: creditSaleTotal,
      icon: CreditCard,
      color: "#4F46E5",
    },
    {
      key: "companyBalance",
      table: "Company Balance",
      label: "Company Balance",
      value: companyBalance,
      icon: DollarSign,
      color: "#0D9488",
    },
  ];

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-[#EEF2F7] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EEF2F7] flex flex-col max-w-md mx-auto font-sans relative">
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      <div className="flex-1 overflow-y-auto pb-8 px-4 space-y-4">
        {/* Reduced Header Size - Changed from py-4 to py-2.5 */}
        <div className="bg-white rounded-2xl px-4 py-2.5 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isMobileView && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 -ml-1 rounded-full bg-gray-100 active:bg-gray-200 transition-colors"
              >
                <Menu size={18} className="text-gray-700" />
              </button>
            )}
            <div>
              <p className="font-semibold text-gray-900 text-sm">
                Hello, {username}
              </p>
              <p className="text-[11px] text-gray-500">
                Here's your overview for today.
              </p>
            </div>
          </div>
          <span className="text-xl">👋</span>
        </div>

        {outOfStockCount > 0 && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded-xl px-4 py-3 flex items-start gap-3">
            <AlertTriangle
              size={18}
              className="text-red-500 mt-0.5 flex-shrink-0"
            />
            <div>
              <p className="text-red-700 font-semibold text-sm">Stock Alert</p>
              <p className="text-red-600 text-xs">
                {outOfStockCount} product(s) out of stock
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {cards.map((card) => (
            <button
              key={card.key}
              onClick={() => handleCardClick(card.table, card.key)}
              className={`rounded-2xl p-4 shadow-sm text-left active:bg-gray-50 transition-colors ${activeCardKey === card.key ? "bg-gray-200 border border-gray-200" : "bg-white"}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <card.icon size={14} style={{ color: card.color }} />
                <p className="text-xs text-gray-500 font-medium">
                  {card.label}
                </p>
              </div>
              <p className="text-lg font-bold" style={{ color: card.color }}>
                ${formatCurrency(card.value)}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-2">{renderTable()}</div>

        <MobileSidePanel
          activeTable={activeTable}
          salesTableData={salesTableData}
          loadingSalesData={loadingSalesData}
          expenseTableData={expenseTableData}
          loadingExpenseData={loadingExpenseData}
          overdueTableData={overdueTableData}
          loadingOverdueData={loadingOverdueData}
          creditSaleTableData={creditSaleTableData}
          loadingCreditSaleData={loadingCreditSaleData}
          stockData={stockData}
          mrList={mrList || []}
          companyBalanceAccounts={companyBalanceAccounts}
          loadingCompanyBalance={loadingCompanyBalance}
          onViewProducts={handleViewProducts}
        />
      </div>

      <ProductsModal
        showModal={showProductsModal}
        onClose={() => setShowProductsModal(false)}
        selectedMRName={selectedMRName}
        selectedMRProducts={selectedMRProducts}
        activeTab={activeTable}
      />
    </div>
  );
};

export default MobileDashboard;
