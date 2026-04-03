import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Users,
  Package,
  ShoppingCart,
  FileText,
  ChevronDown,
  Settings,
  Truck,
  Boxes,
  CreditCard,
  TrendingUp,
  FileBarChart,
  Wallet,
  UserCog,
  ClipboardList,
  DollarSign,
  BarChart3,
  ListChecks,
  Calendar,
  Umbrella,
  Coins,
  Landmark,
  Receipt,
  PieChart,
  UserSearch,
  Target,
  MapPin,
  Repeat,
  CheckCircle,
  Calculator,
  UserPlus,
  CalendarDays,
  CalendarRange,
  Percent,
  Scale,
  TrendingDown,
  Globe,
  HandCoins,
  PackageSearch,
  Layers,
  Building,
  Eye,
  Clock,
  BriefcaseMedical,
  RefreshCw,
  BanknoteIcon,
  X,
} from "lucide-react";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const tabLabelMap = {
  reports_dailyreport: "Daily Report",
  reports_averageprice: "Average Price",
  reports_newcustomeraddition: "New Customer Addition",
  reports_masterCustomerReports: "Master Customer Report",
  reports_monthlyrepeatrate: "Monthly Repeat Rate",
  reports_annualrepeatrate: "Annual Repeat Rate",
  reports_productreport: "Product Report",
  reports_mrwiseoutstanding: "MR Wise Outstanding",
  reports_mrwisesales: "MR Wise Sales",
  reports_cashsales: "Cash Sales",
  reports_outstandingcollection: "Outstanding Collection",
  reports_totalcashoutflow: "Total Cash Outflow", // Changed from reports_totalexpense
  reports_remittance: "Remittance",
  reports_provincewisesale: "Province Wise Sale",
  reports_provincewisecustomer: "Province Wise Customer",
  reports_profitloss: "Profit Loss",
  reports_financeReports: "Finance Reports",
  reports_stocksinhands: "Stock in hands",
  reports_salesummary: "Sale Summary",
  reports_dailysample: "Daily Sample",
  reports_expirystock: "Expiry Stock",
  masterCustomerReports_retention: "Customer Retention Rate",
  masterCustomerReports_acceptance: "Product Acceptance Rate",
  masterCustomerReports_zonewise: "Zone Wise Customers",
  financeReports_salessalary: "Sales Salary Ratio",
  financeReports_salarycogs: "Salary COGS Ratio",
  financeReports_operationcostcogs: "Operation Cost COGS Ratio",
  financeReports_operationcostsales: "Operation Cost Sales Ratio",
  financeReports_tourexpensesales: "Tour Expense Sales Ratio",
  dashboard: "Dashboard",
  master: "Master",
  settings: "Settings",
  products: "Product Manager",
  purchase: "Purchase",
  sales: "Sales",
  stockAdjustment: "Stock Adjustment",
  stockTransfer: "Stock Transfer",
  mrCarryStock: "MR Carry Stock",
  accounts: "Accounts",
  expense: "Expense",
  reports: "Reports",
  staff: "Staff",
  utility: "Utility",
  onlineOrders: "Online Orders",
  hrm: "HRM",
  master_customers: "Customers",
  master_suppliers: "Suppliers",
  products_products: "Products",
  products_pricelist: "Price List",
  purchase_purchase: "Purchase",
  purchase_purchasereturn: "Purchase Return",
  purchase_purchaseout: "Purchase Out",
  sales_sale: "Sale",
  sales_salereturn: "Sale Return",
  expense_categories: "Expense Categories",
  expense_expenses: "Expenses",
  mrCarryStock_carrystockview: "Carry Stock View",
  mrCarryStock_stockreturn: "Stock Return",
  accounts_cashbank: "Cash & Bank",
  accounts_mrcash: "MR Cash",
  hrm_dashboard: "Dashboard",
  hrm_holidays: "Holidays",
  hrm_leaveattendance: "Leave & Attendance",
  hrm_payroll: "Payroll",
  hrm_mrbasicpayroll: "MR Basic Payroll",
  utility_companyprofile: "Company Profile",
  utility_tabhideview: "Tab Hide and View",
  settings_companyprofile: "Company Profile",
  settings_tabmanipulation: "Tab Manipulation",
};

const formatTabLabel = (tabId) => {
  if (tabLabelMap[tabId]) return tabLabelMap[tabId];
  const parts = tabId.split("_");
  const label = parts.length > 1 ? parts[1] : parts[0];
  return label
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
};

const tabService = {
  async getVisibleTabs() {
    try {
      const res = await fetch(`${backendUrl}/api/h-tabs/visible`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const arr = Array.isArray(data.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : null;
      if (arr) {
        const out = {};
        arr.forEach((t) => {
          if (t.tabId && t.isVisible !== undefined)
            out[t.tabId] = { visible: t.isVisible, sequence: t.sequence || 0 };
        });
        return out;
      }
      return data.data || {};
    } catch {
      return this.getDefaultVisibleTabs();
    }
  },
  getDefaultVisibleTabs() {
    const v = (s) => ({ visible: true, sequence: s });
    return {
      dashboard: v(1),
      master: v(2),
      settings: v(3),
      products: v(4),
      purchase: v(5),
      sales: v(6),
      stockAdjustment: v(7),
      stockTransfer: v(8),
      mrCarryStock: v(9),
      accounts: v(10),
      expense: v(11),
      reports: v(12),
      staff: v(13),
      utility: v(14),
      onlineOrders: v(15),
      hrm: v(16),
      master_customers: v(1),
      master_suppliers: v(2),
      products_products: v(1),
      products_pricelist: v(2),
      purchase_purchase: v(1),
      purchase_purchasereturn: v(2),
      purchase_purchaseout: v(3),
      sales_sale: v(1),
      sales_salereturn: v(2),
      expense_categories: v(1),
      expense_expenses: v(2),
      mrCarryStock_carrystockview: v(1),
      mrCarryStock_stockreturn: v(2),
      accounts_cashbank: v(1),
      accounts_mrcash: v(2),
      hrm_dashboard: v(1),
      hrm_holidays: v(2),
      hrm_leaveattendance: v(3),
      hrm_payroll: v(4),
      hrm_mrbasicpayroll: v(5),
      reports_dailyreport: v(1),
      reports_averageprice: v(2),
      reports_newcustomeraddition: v(3),
      reports_masterCustomerReports: v(4),
      reports_monthlyrepeatrate: v(5),
      reports_annualrepeatrate: v(6),
      reports_productreport: v(7),
      reports_mrwiseoutstanding: v(8),
      reports_mrwisesales: v(9),
      reports_cashsales: v(10),
      reports_outstandingcollection: v(11),
      reports_totalcashoutflow: v(12), // Changed from reports_totalexpense
      reports_remittance: v(13),
      reports_provincewisesale: v(14),
      reports_provincewisecustomer: v(15),
      reports_profitloss: v(16),
      reports_financeReports: v(17),
      reports_stocksinhands: v(18),
      reports_salesummary: v(19),
      reports_dailysample: v(20),
      reports_expirystock: v(21),
      masterCustomerReports_retention: v(1),
      masterCustomerReports_acceptance: v(2),
      masterCustomerReports_zonewise: v(3),
      financeReports_salessalary: v(1),
      financeReports_salarycogs: v(2),
      financeReports_operationcostcogs: v(3),
      financeReports_operationcostsales: v(4),
      financeReports_tourexpensesales: v(5),
    };
  },
};

const masterCustomerReportPaths = [
  "/reportlayout/customerretention",
  "/reportlayout/customeracceptance",
  "/reportlayout/zonewisecustomers",
  "/reportlayout/monthlyrepeatrate",
  "/reportlayout/annualrepeatrate",
];
const financeReportPaths = [
  "/reportlayout/sales-salary-ratio",
  "/reportlayout/salary-cogs-ratio",
  "/reportlayout/operation-cost-cogs-ratio",
  "/reportlayout/operation-cost-sales-ratio",
  "/reportlayout/tour-expense-sales-ratio",
];
const reportsInHandPaths = ["/reportlayout/reports-in-hand"];
const productReportPaths = [
  "/reportlayout/product-performance",
  "/reportlayout/stock-movement",
  "/reportlayout/slow-moving-items",
  "/reportlayout/product-profitability",
  "/reportlayout/product-report",
];

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR
// Props:
//   isOpen        – drawer open / desktop expanded
//   toggleSidebar – close handler (called by ✕ inside drawer OR backdrop click)
//   isMobile      – injected by DashboardLayout; Sidebar never renders a hamburger
// ─────────────────────────────────────────────────────────────────────────────
function Sidebar({ isOpen, toggleSidebar, isMobile = false }) {
  const location = useLocation();
  const show = isOpen || isMobile; // labels visible when open on desktop OR always on mobile

  const [activeParentMenu, setActiveParentMenu] = useState(null);
  const [activeSubMenu, setActiveSubMenu] = useState(null);
  const [activeFinanceSubMenu, setActiveFinanceSubMenu] = useState(null);
  const [visibleTabs, setVisibleTabs] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const refreshTabData = React.useCallback(() => setLastUpdate(Date.now()), []);

  // Auto-close drawer on navigation (mobile only)
  useEffect(() => {
    if (isMobile && isOpen) toggleSidebar();
  }, [location.pathname]); // eslint-disable-line

  useEffect(() => {
    setLoading(true);
    tabService
      .getVisibleTabs()
      .then(setVisibleTabs)
      .catch(() => setVisibleTabs(tabService.getDefaultVisibleTabs()))
      .finally(() => setLoading(false));
  }, [lastUpdate]);

  useEffect(() => {
    const p = location.pathname;
    if (p.startsWith("/masterlayout")) setActiveParentMenu("master");
    else if (p.startsWith("/productmanagerlayout"))
      setActiveParentMenu("products");
    else if (p.startsWith("/purchaselayout")) setActiveParentMenu("purchase");
    else if (p.startsWith("/salelayout")) setActiveParentMenu("sales");
    else if (p.startsWith("/expenselayout")) setActiveParentMenu("expense");
    else if (p.startsWith("/reportlayout")) {
      setActiveParentMenu("reports");
      if (masterCustomerReportPaths.some((x) => p.startsWith(x)))
        setActiveSubMenu("masterCustomerReports");
      if (financeReportPaths.some((x) => p.startsWith(x)))
        setActiveFinanceSubMenu("financeReports");
    } else if (p.startsWith("/utilitylayout")) setActiveParentMenu("utility");
    else if (p.startsWith("/hrmlayout")) setActiveParentMenu("hrm");
    else if (p.startsWith("/accountlayout")) setActiveParentMenu("accounts");
    else if (p.startsWith("/settingslayout")) setActiveParentMenu("settings");
    else if (p.startsWith("/mrcarrystocklayout"))
      setActiveParentMenu("mrCarryStock");
    else setActiveParentMenu(null);
  }, [location.pathname]);

  useEffect(() => {
    const h = () => refreshTabData();
    window.addEventListener("tabVisibilityChanged", h);
    window.addEventListener("storage", (e) => {
      if (e.key === "tabVisibilityUpdated") h();
    });
    return () => window.removeEventListener("tabVisibilityChanged", h);
  }, [refreshTabData]);

  const isActive = (path) => location.pathname === path;
  const toggleMenu = (k) => setActiveParentMenu((p) => (p === k ? null : k));
  const toggleSubMenu = (k) => setActiveSubMenu((p) => (p === k ? null : k));
  const toggleFinanceSubMenu = (k) =>
    setActiveFinanceSubMenu((p) => (p === k ? null : k));

  const shouldShow = (id) => {
    if (loading) return true;
    const c = visibleTabs[id];
    if (!c && c !== false) return false;
    return typeof c === "object" ? c.visible === true : c === true;
  };
  const sorted = (ids) =>
    ids
      .filter(shouldShow)
      .sort(
        (a, b) =>
          (visibleTabs[a]?.sequence || 0) - (visibleTabs[b]?.sequence || 0),
      );

  // CSS helpers
  const lnk = (path) =>
    `flex items-center gap-3 p-2 rounded transition-all duration-150 ${isActive(path) ? "bg-gray-500 text-white shadow-md" : "hover:bg-gray-700 text-gray-200"}`;
  const cld = (path) =>
    `flex items-center gap-3 p-2 rounded transition-all duration-150 ${isActive(path) ? "bg-gray-500 text-white shadow-md" : "hover:bg-gray-600 text-gray-200"}`;
  const drp = (k) =>
    `flex items-center justify-between w-full p-2 rounded-md transition-all duration-150 ${activeParentMenu === k ? "bg-blue-300 text-gray-900 shadow-lg" : "hover:bg-gray-700 text-gray-200"}`;
  const sub = (k) =>
    `flex items-center justify-between w-full p-2 rounded-md transition-all duration-150 ${activeSubMenu === k ? "bg-blue-200 text-gray-900 shadow-md" : "hover:bg-gray-600 text-gray-200"}`;
  const fin = (k) =>
    `flex items-center justify-between w-full p-2 rounded-md transition-all duration-150 ${activeFinanceSubMenu === k ? "bg-blue-200 text-gray-900 shadow-md" : "hover:bg-gray-600 text-gray-200"}`;
  const chv = (open) => (
    <ChevronDown
      className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    />
  );

  const navContent = (
    <div className="bg-gray-900 text-white flex flex-col h-full">
      {/* Logo row + ✕ close (mobile only) */}
      <div className="h-16 flex items-center justify-between px-3 border-b border-gray-700 flex-shrink-0">
        <img
          src="/mainlogo.png"
          alt="CRM Logo"
          className={`${show ? "h-10" : "h-8"} object-contain`}
        />
        {isMobile && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Loading…
        </div>
      ) : (
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-2">
          {/* Dashboard */}
          {shouldShow("dashboard") && (
            <Link to="/" className={lnk("/")}>
              <Home className="w-5 h-5 flex-shrink-0" />
              {show && <span>Dashboard</span>}
            </Link>
          )}

          {/* Master */}
          {shouldShow("master") && (
            <div>
              <button
                onClick={() => toggleMenu("master")}
                className={drp("master")}
              >
                <span className="flex items-center gap-3">
                  <Users className="w-5 h-5 flex-shrink-0" />
                  {show && <span>Master</span>}
                </span>
                {show && chv(activeParentMenu === "master")}
              </button>
              {activeParentMenu === "master" && show && (
                <div className="ml-6 mt-1 space-y-1">
                  {shouldShow("master_customers") && (
                    <Link
                      to="/masterlayout/customer"
                      className={cld("/masterlayout/customer")}
                    >
                      <Users className="w-4 h-4 flex-shrink-0" />
                      <span>Customers</span>
                    </Link>
                  )}
                  {shouldShow("master_suppliers") && (
                    <Link
                      to="/masterlayout/supplier"
                      className={cld("/masterlayout/supplier")}
                    >
                      <Truck className="w-4 h-4 flex-shrink-0" />
                      <span>Suppliers</span>
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Settings */}
          {shouldShow("settings") && (
            <div>
              <button
                onClick={() => toggleMenu("settings")}
                className={drp("settings")}
              >
                <span className="flex items-center gap-3">
                  <Settings className="w-5 h-5 flex-shrink-0" />
                  {show && <span>Settings</span>}
                </span>
                {show && chv(activeParentMenu === "settings")}
              </button>
              {activeParentMenu === "settings" && show && (
                <div className="ml-6 mt-1 space-y-1">
                  {shouldShow("settings_companyprofile") && (
                    <Link
                      to="/settingslayout/company-profile"
                      className={cld("/settingslayout/company-profile")}
                    >
                      <Building className="w-4 h-4 flex-shrink-0" />
                      <span>Company Profile</span>
                    </Link>
                  )}
                  {shouldShow("settings_tabmanipulation") && (
                    <Link
                      to="/settingslayout/tab-manipulation"
                      className={cld("/settingslayout/tab-manipulation")}
                    >
                      <Eye className="w-4 h-4 flex-shrink-0" />
                      <span>Tab Manipulation</span>
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Product Manager */}
          {shouldShow("products") && (
            <div>
              <button
                onClick={() => toggleMenu("products")}
                className={drp("products")}
              >
                <span className="flex items-center gap-3">
                  <Package className="w-5 h-5 flex-shrink-0" />
                  {show && <span>Product Manager</span>}
                </span>
                {show && chv(activeParentMenu === "products")}
              </button>
              {activeParentMenu === "products" && show && (
                <div className="ml-6 mt-1 space-y-1">
                  {sorted(["products_products", "products_pricelist"]).map(
                    (id) => {
                      const m = {
                        products_products: {
                          to: "/productmanagerlayout/product",
                          icon: Boxes,
                          label: "Products",
                        },
                        products_pricelist: {
                          to: "/productmanagerlayout/pricelist",
                          icon: ClipboardList,
                          label: "Price List",
                        },
                      };
                      const { to, icon: I, label } = m[id] || {};
                      return to ? (
                        <Link key={id} to={to} className={cld(to)}>
                          <I className="w-4 h-4 flex-shrink-0" />
                          <span>{label}</span>
                        </Link>
                      ) : null;
                    },
                  )}
                </div>
              )}
            </div>
          )}

          {/* Purchase */}
          {shouldShow("purchase") && (
            <div>
              <button
                onClick={() => toggleMenu("purchase")}
                className={drp("purchase")}
              >
                <span className="flex items-center gap-3">
                  <ShoppingCart className="w-5 h-5 flex-shrink-0" />
                  {show && <span>Purchase</span>}
                </span>
                {show && chv(activeParentMenu === "purchase")}
              </button>
              {activeParentMenu === "purchase" && show && (
                <div className="ml-6 mt-1 space-y-1">
                  {sorted([
                    "purchase_purchase",
                    "purchase_purchasereturn",
                    "purchase_purchaseout",
                  ]).map((id) => {
                    const m = {
                      purchase_purchase: {
                        to: "/purchaselayout/purchase",
                        icon: Package,
                        label: "Purchase",
                      },
                      purchase_purchasereturn: {
                        to: "/purchaselayout/purchasereturn",
                        icon: FileText,
                        label: "Purchase Return",
                      },
                      purchase_purchaseout: {
                        to: "/purchaselayout/purchaseout",
                        icon: Truck,
                        label: "Purchase Out",
                      },
                    };
                    const { to, icon: I, label } = m[id] || {};
                    return to ? (
                      <Link key={id} to={to} className={cld(to)}>
                        <I className="w-4 h-4 flex-shrink-0" />
                        <span>{label}</span>
                      </Link>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sales */}
          {shouldShow("sales") && (
            <div>
              <button
                onClick={() => toggleMenu("sales")}
                className={drp("sales")}
              >
                <span className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 flex-shrink-0" />
                  {show && <span>Sales</span>}
                </span>
                {show && chv(activeParentMenu === "sales")}
              </button>
              {activeParentMenu === "sales" && show && (
                <div className="ml-6 mt-1 space-y-1">
                  {sorted(["sales_sale", "sales_salereturn"]).map((id) => {
                    const m = {
                      sales_sale: {
                        to: "/salelayout/sale",
                        icon: DollarSign,
                        label: "Sale",
                      },
                      sales_salereturn: {
                        to: "/salelayout/salereturn",
                        icon: FileText,
                        label: "Sale Return",
                      },
                    };
                    const { to, icon: I, label } = m[id] || {};
                    return to ? (
                      <Link key={id} to={to} className={cld(to)}>
                        <I className="w-4 h-4 flex-shrink-0" />
                        <span>{label}</span>
                      </Link>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}

          {/* Stock Adjustment */}
          {shouldShow("stockAdjustment") && (
            <Link to="/stockadjustment" className={lnk("/stockadjustment")}>
              <ListChecks className="w-5 h-5 flex-shrink-0" />
              {show && <span>Stock Adjustment</span>}
            </Link>
          )}

          {/* Stock Transfer */}
          {shouldShow("stockTransfer") && (
            <Link to="/stocktransfer" className={lnk("/stocktransfer")}>
              <Truck className="w-5 h-5 flex-shrink-0" />
              {show && <span>Stock Transfer</span>}
            </Link>
          )}

          {/* MR Carry Stock */}
          {shouldShow("mrCarryStock") && (
            <div>
              <button
                onClick={() => toggleMenu("mrCarryStock")}
                className={drp("mrCarryStock")}
              >
                <span className="flex items-center gap-3">
                  <BriefcaseMedical className="w-5 h-5 flex-shrink-0" />
                  {show && <span>MR Carry Stock</span>}
                </span>
                {show && chv(activeParentMenu === "mrCarryStock")}
              </button>
              {activeParentMenu === "mrCarryStock" && show && (
                <div className="ml-6 mt-1 space-y-1">
                  {sorted([
                    "mrCarryStock_carrystockview",
                    "mrCarryStock_stockreturn",
                  ]).map((id) => {
                    const m = {
                      mrCarryStock_carrystockview: {
                        to: "/mrcarrystocklayout/carrystockview",
                        icon: Eye,
                        label: "Carry Stock View",
                      },
                      mrCarryStock_stockreturn: {
                        to: "/mrcarrystocklayout/stockreturn",
                        icon: RefreshCw,
                        label: "Stock Return",
                      },
                    };
                    const { to, icon: I, label } = m[id] || {};
                    return to ? (
                      <Link key={id} to={to} className={cld(to)}>
                        <I className="w-4 h-4 flex-shrink-0" />
                        <span>{label}</span>
                      </Link>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}

          {/* Accounts */}
          {shouldShow("accounts") && (
            <div>
              <button
                onClick={() => toggleMenu("accounts")}
                className={drp("accounts")}
              >
                <span className="flex items-center gap-3">
                  <Landmark className="w-5 h-5 flex-shrink-0" />
                  {show && <span>Accounts</span>}
                </span>
                {show && chv(activeParentMenu === "accounts")}
              </button>
              {activeParentMenu === "accounts" && show && (
                <div className="ml-6 mt-1 space-y-1">
                  {sorted(["accounts_cashbank", "accounts_mrcash"]).map(
                    (id) => {
                      const m = {
                        accounts_cashbank: {
                          to: "/accountlayout",
                          icon: Wallet,
                          label: "Cash & Bank",
                        },
                        accounts_mrcash: {
                          to: "/accountlayout/mrcash",
                          icon: Coins,
                          label: "MR Cash",
                        },
                      };
                      const { to, icon: I, label } = m[id] || {};
                      return to ? (
                        <Link key={id} to={to} className={cld(to)}>
                          <I className="w-4 h-4 flex-shrink-0" />
                          <span>{label}</span>
                        </Link>
                      ) : null;
                    },
                  )}
                </div>
              )}
            </div>
          )}

          {/* Expense */}
          {shouldShow("expense") && (
            <div>
              <button
                onClick={() => toggleMenu("expense")}
                className={drp("expense")}
              >
                <span className="flex items-center gap-3">
                  <FileText className="w-5 h-5 flex-shrink-0" />
                  {show && <span>Expense</span>}
                </span>
                {show && chv(activeParentMenu === "expense")}
              </button>
              {activeParentMenu === "expense" && show && (
                <div className="ml-6 mt-1 space-y-1">
                  {sorted(["expense_categories", "expense_expenses"]).map(
                    (id) => {
                      const m = {
                        expense_categories: {
                          to: "/expenselayout/expensecategories",
                          icon: Layers,
                          label: "Expense Categories",
                        },
                        expense_expenses: {
                          to: "/expenselayout/expenses",
                          icon: DollarSign,
                          label: "Expenses",
                        },
                      };
                      const { to, icon: I, label } = m[id] || {};
                      return to ? (
                        <Link key={id} to={to} className={cld(to)}>
                          <I className="w-4 h-4 flex-shrink-0" />
                          <span>{label}</span>
                        </Link>
                      ) : null;
                    },
                  )}
                </div>
              )}
            </div>
          )}

          {/* Reports */}
          {shouldShow("reports") && (
            <div>
              <button
                onClick={() => toggleMenu("reports")}
                className={drp("reports")}
              >
                <span className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 flex-shrink-0" />
                  {show && <span>Reports</span>}
                </span>
                {show && chv(activeParentMenu === "reports")}
              </button>
              {activeParentMenu === "reports" && show && (
                <div className="ml-6 mt-1 space-y-1">
                  {sorted([
                    "reports_dailyreport",
                    "reports_averageprice",
                    "reports_newcustomeraddition",
                    "reports_masterCustomerReports",
                    "reports_monthlyrepeatrate",
                    "reports_annualrepeatrate",
                    "reports_productreport",
                    "reports_mrwiseoutstanding",
                    "reports_mrwisesales",
                    "reports_cashsales",
                    "reports_outstandingcollection",
                    "reports_totalcashoutflow", // Changed from reports_totalexpense
                    "reports_remittance",
                    "reports_provincewisesale",
                    "reports_provincewisecustomer",
                    "reports_profitloss",
                    "reports_financeReports",
                    "reports_stocksinhands",
                    "reports_salesummary",
                    "reports_dailysample",
                    "reports_expirystock",
                  ]).map((tabId) => {
                    if (tabId === "reports_masterCustomerReports")
                      return (
                        <div key={tabId}>
                          <button
                            onClick={() =>
                              toggleSubMenu("masterCustomerReports")
                            }
                            className={sub("masterCustomerReports")}
                          >
                            <span className="flex items-center gap-3">
                              <Users className="w-4 h-4 flex-shrink-0" />
                              <span>Master Customer Report</span>
                            </span>
                            {chv(activeSubMenu === "masterCustomerReports")}
                          </button>
                          {activeSubMenu === "masterCustomerReports" && (
                            <div className="ml-4 mt-1 space-y-1">
                              {sorted([
                                "masterCustomerReports_retention",
                                "masterCustomerReports_acceptance",
                                "masterCustomerReports_zonewise",
                              ]).map((id) => {
                                const m = {
                                  masterCustomerReports_retention: {
                                    to: "/reportlayout/customerretention",
                                    icon: Repeat,
                                    label: "Customer Retention Rate",
                                  },
                                  masterCustomerReports_acceptance: {
                                    to: "/reportlayout/customeracceptance",
                                    icon: CheckCircle,
                                    label: "Product Acceptance Rate",
                                  },
                                  masterCustomerReports_zonewise: {
                                    to: "/reportlayout/zonewisecustomers",
                                    icon: MapPin,
                                    label: "Zone Wise Customers",
                                  },
                                };
                                const { to, icon: I, label } = m[id] || {};
                                return to ? (
                                  <Link key={id} to={to} className={cld(to)}>
                                    <I className="w-4 h-4 flex-shrink-0" />
                                    <span>{label}</span>
                                  </Link>
                                ) : null;
                              })}
                            </div>
                          )}
                        </div>
                      );
                    if (tabId === "reports_financeReports")
                      return (
                        <div key={tabId}>
                          <button
                            onClick={() =>
                              toggleFinanceSubMenu("financeReports")
                            }
                            className={fin("financeReports")}
                          >
                            <span className="flex items-center gap-3">
                              <FileBarChart className="w-4 h-4 flex-shrink-0" />
                              <span>Finance Reports</span>
                            </span>
                            {chv(activeFinanceSubMenu === "financeReports")}
                          </button>
                          {activeFinanceSubMenu === "financeReports" && (
                            <div className="ml-4 mt-1 space-y-1">
                              {sorted([
                                "financeReports_salessalary",
                                "financeReports_salarycogs",
                                "financeReports_operationcostcogs",
                                "financeReports_operationcostsales",
                                "financeReports_tourexpensesales",
                              ]).map((id) => {
                                const lm = {
                                  financeReports_salessalary:
                                    "/reportlayout/sales-salary-ratio",
                                  financeReports_salarycogs:
                                    "/reportlayout/salary-cogs-ratio",
                                  financeReports_operationcostcogs:
                                    "/reportlayout/operation-cost-cogs-ratio",
                                  financeReports_operationcostsales:
                                    "/reportlayout/operation-cost-sales-ratio",
                                  financeReports_tourexpensesales:
                                    "/reportlayout/tour-expense-sales-ratio",
                                };
                                const im = {
                                  financeReports_salessalary: Percent,
                                  financeReports_salarycogs: Scale,
                                  financeReports_operationcostcogs:
                                    TrendingDown,
                                  financeReports_operationcostsales: BarChart3,
                                  financeReports_tourexpensesales: MapPin,
                                };
                                const I = im[id],
                                  path = lm[id];
                                return path ? (
                                  <Link
                                    key={id}
                                    to={path}
                                    className={cld(path)}
                                  >
                                    <I className="w-4 h-4 flex-shrink-0" />
                                    <span>{formatTabLabel(id)}</span>
                                  </Link>
                                ) : null;
                              })}
                            </div>
                          )}
                        </div>
                      );
                    if (tabId === "reports_profitloss")
                      return (
                        <Link
                          key={tabId}
                          to="/reportlayout/profitloss"
                          className={cld("/reportlayout/profitloss")}
                        >
                          <DollarSign className="w-4 h-4 flex-shrink-0" />
                          <span>Profit Loss</span>
                        </Link>
                      );
                    if (tabId === "reports_totalcashoutflow")
                      // Changed from reports_totalexpense
                      return (
                        <Link
                          key={tabId}
                          to="/reportlayout/totalexpense"
                          className={cld("/reportlayout/totalexpense")}
                        >
                          <PieChart className="w-4 h-4 flex-shrink-0" />
                          <span>Total Cash Outflow</span>
                        </Link>
                      );
                    if (tabId === "reports_stocksinhands")
                      return (
                        <Link
                          key={tabId}
                          to="/reportlayout/reports-in-hand"
                          className={cld("/reportlayout/reports-in-hand")}
                        >
                          <HandCoins className="w-4 h-4 flex-shrink-0" />
                          <span>Stock in hands</span>
                        </Link>
                      );
                    const lm = {
                      reports_dailyreport: "/reportlayout/dailyreport",
                      reports_averageprice: "/reportlayout/averageprice",
                      reports_newcustomeraddition:
                        "/reportlayout/newcustomeraddition",
                      reports_monthlyrepeatrate:
                        "/reportlayout/monthlyrepeatrate",
                      reports_annualrepeatrate:
                        "/reportlayout/annualrepeatrate",
                      reports_productreport: "/reportlayout/product-report",
                      reports_mrwiseoutstanding:
                        "/reportlayout/mrwiseoutstanding",
                      reports_mrwisesales: "/reportlayout/mrwisesales",
                      reports_cashsales: "/reportlayout/cashsales",
                      reports_outstandingcollection:
                        "/reportlayout/outstandingcollection",
                      reports_remittance: "/reportlayout/remittance",
                      reports_provincewisesale:
                        "/reportlayout/province-wise-sale",
                      reports_provincewisecustomer:
                        "/reportlayout/province-wise-customer",
                      reports_salesummary: "/reportlayout/salesummary",
                      reports_dailysample: "/reportlayout/dailysample",
                      reports_expirystock: "/reportlayout/expiry-stock-report",
                    };
                    const im = {
                      reports_dailyreport: CreditCard,
                      reports_averageprice: Calculator,
                      reports_newcustomeraddition: UserPlus,
                      reports_monthlyrepeatrate: CalendarDays,
                      reports_annualrepeatrate: CalendarRange,
                      reports_productreport: PackageSearch,
                      reports_mrwiseoutstanding: UserSearch,
                      reports_mrwisesales: Target,
                      reports_cashsales: DollarSign,
                      reports_outstandingcollection: Receipt,
                      reports_remittance: Coins,
                      reports_provincewisesale: Globe,
                      reports_provincewisecustomer: Users,
                      reports_salesummary: TrendingUp,
                      reports_dailysample: Boxes,
                      reports_expirystock: Clock,
                    };
                    const I = im[tabId],
                      path = lm[tabId];
                    return I && path ? (
                      <Link key={tabId} to={path} className={cld(path)}>
                        <I className="w-4 h-4 flex-shrink-0" />
                        <span>{formatTabLabel(tabId)}</span>
                      </Link>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}

          {/* Utility */}
          {shouldShow("utility") && (
            <div>
              <button
                onClick={() => toggleMenu("utility")}
                className={drp("utility")}
              >
                <span className="flex items-center gap-3">
                  <Settings className="w-5 h-5 flex-shrink-0" />
                  {show && <span>Settings</span>}
                </span>
                {show && chv(activeParentMenu === "utility")}
              </button>
              {activeParentMenu === "utility" && show && (
                <div className="ml-6 mt-1 space-y-1">
                  {sorted([
                    "utility_companyprofile",
                    "utility_tabhideview",
                  ]).map((id) => {
                    const m = {
                      utility_companyprofile: {
                        to: "/utilitylayout/companyprofile",
                        icon: Building,
                        label: "Company Profile",
                      },
                      utility_tabhideview: {
                        to: "/utilitylayout/tabHideView",
                        icon: Eye,
                        label: "Tab Hide and Show",
                      },
                    };
                    const { to, icon: I, label } = m[id] || {};
                    return to ? (
                      <Link key={id} to={to} className={cld(to)}>
                        <I className="w-4 h-4 flex-shrink-0" />
                        <span>{label}</span>
                      </Link>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}

          {/* HRM */}
          {shouldShow("hrm") && (
            <div>
              <button onClick={() => toggleMenu("hrm")} className={drp("hrm")}>
                <span className="flex items-center gap-3">
                  <UserCog className="w-5 h-5 flex-shrink-0" />
                  {show && <span>HRM</span>}
                </span>
                {show && chv(activeParentMenu === "hrm")}
              </button>
              {activeParentMenu === "hrm" && show && (
                <div className="ml-6 mt-1 space-y-1">
                  {sorted([
                    "hrm_dashboard",
                    "hrm_holidays",
                    "hrm_leaveattendance",
                    "hrm_payroll",
                    "hrm_mrbasicpayroll",
                  ]).map((id) => {
                    const m = {
                      hrm_dashboard: {
                        to: "/hrmlayout/dashboard",
                        icon: Home,
                        label: "Dashboard",
                      },
                      hrm_holidays: {
                        to: "/hrmlayout/holidays",
                        icon: Umbrella,
                        label: "Holidays",
                      },
                      hrm_leaveattendance: {
                        to: "/hrmlayout/leaveattendance",
                        icon: Calendar,
                        label: "Leave & Attendance",
                      },
                      hrm_payroll: {
                        to: "/hrmlayout/payroll",
                        icon: DollarSign,
                        label: "Payroll",
                      },
                      hrm_mrbasicpayroll: {
                        to: "/hrmlayout/mrbasicpayroll",
                        icon: BanknoteIcon,
                        label: "MR Basic Payroll",
                      },
                    };
                    const { to, icon: I, label } = m[id] || {};
                    return to ? (
                      <Link key={id} to={to} className={cld(to)}>
                        <I className="w-4 h-4 flex-shrink-0" />
                        <span>{label}</span>
                      </Link>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}
        </nav>
      )}
    </div>
  );

  // ── MOBILE: overlay drawer, NO hamburger rendered inside ──
  if (isMobile) {
    return (
      <>
        {isOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-30"
            onClick={toggleSidebar}
            aria-hidden="true"
          />
        )}
        <div
          className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          {navContent}
        </div>
      </>
    );
  }

  // ── DESKTOP: static sidebar ──
  return (
    <div
      className={`bg-gray-900 text-white transition-all duration-300 flex-shrink-0 flex flex-col ${isOpen ? "w-64" : "w-16"}`}
    >
      {navContent}
    </div>
  );
}

export default Sidebar;
