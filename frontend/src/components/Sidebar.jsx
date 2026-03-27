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
  Barcode,
  CreditCard,
  TrendingUp,
  FileBarChart,
  Wallet,
  UserCog,
  ClipboardList,
  DollarSign,
  Briefcase,
  BarChart3,
  AlertTriangle,
  ListChecks,
  Calendar,
  Umbrella,
  UsersRound,
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
  Database,
  TrendingUp as TrendingUpIcon,
  PackageSearch,
  Layers,
  Building,
  Eye,
  Clock,
  BriefcaseMedical,
  Archive,
  ShoppingBag,
  UserCheck,
  RefreshCw,
  BanknoteIcon,
  ReceiptText,
  X,
  Menu,
} from "lucide-react";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Complete mapping dictionary for tab labels
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
  reports_totalexpense: "Total Expense",
  reports_remittance: "Remittance",
  reports_provincewisesale: "Province Wise Sale",
  reports_provincewisecustomer: "Province Wise Customer",
  reports_profitloss: "Profit Loss",
  reports_financeReports: "Finance Reports",
  reports_reportsinhand: "Reports in Hand",
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
  utility_tabhideview: "Tab Hide and Show",
  settings_companyprofile: "Company Profile",
  settings_tabmanipulation: "Tab Manipulation",
};

const formatTabLabel = (tabId) => {
  if (tabLabelMap[tabId]) return tabLabelMap[tabId];
  const parts = tabId.split("_");
  const label = parts.length > 1 ? parts[1] : parts[0];
  let formatted = label.replace(/([a-z])([A-Z])/g, "$1 $2");
  formatted = formatted
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
  formatted = formatted
    .replace(/\bMr\b/gi, "MR")
    .replace(/\bCogs\b/gi, "COGS")
    .replace(/\bPl\b/gi, "PL")
    .replace(/\bHrm\b/gi, "HRM")
    .replace(/\bMrcash\b/gi, "MR Cash");
  return formatted;
};

const tabService = {
  async getVisibleTabs() {
    try {
      const response = await fetch(`${backendUrl}/api/h-tabs/visible`);
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data.data) || Array.isArray(data)) {
        const tabsArray = Array.isArray(data.data) ? data.data : data;
        const transformed = {};
        tabsArray.forEach((tab) => {
          if (tab.tabId && tab.isVisible !== undefined) {
            transformed[tab.tabId] = {
              visible: tab.isVisible,
              sequence: tab.sequence || 0,
            };
          }
        });
        return transformed;
      }
      if (data.data && typeof data.data === "object") return data.data;
      return data.data || {};
    } catch (error) {
      return this.getDefaultVisibleTabs();
    }
  },

  async updateTabVisibility(tabUpdates) {
    try {
      const response = await fetch(`${backendUrl}/api/h-tabs/visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: tabUpdates }),
      });
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      throw error;
    }
  },

  getDefaultVisibleTabs() {
    return {
      dashboard: { visible: true, sequence: 1 },
      master: { visible: true, sequence: 2 },
      settings: { visible: true, sequence: 3 },
      products: { visible: true, sequence: 4 },
      purchase: { visible: true, sequence: 5 },
      sales: { visible: true, sequence: 6 },
      stockAdjustment: { visible: true, sequence: 7 },
      stockTransfer: { visible: true, sequence: 8 },
      mrCarryStock: { visible: true, sequence: 9 },
      accounts: { visible: true, sequence: 10 },
      expense: { visible: true, sequence: 11 },
      reports: { visible: true, sequence: 12 },
      staff: { visible: true, sequence: 13 },
      utility: { visible: true, sequence: 14 },
      onlineOrders: { visible: true, sequence: 15 },
      hrm: { visible: true, sequence: 16 },
      master_customers: { visible: true, sequence: 1 },
      master_suppliers: { visible: true, sequence: 2 },
      products_products: { visible: true, sequence: 1 },
      products_pricelist: { visible: true, sequence: 2 },
      purchase_purchase: { visible: true, sequence: 1 },
      purchase_purchasereturn: { visible: true, sequence: 2 },
      purchase_purchaseout: { visible: true, sequence: 3 },
      sales_sale: { visible: true, sequence: 1 },
      sales_salereturn: { visible: true, sequence: 2 },
      expense_categories: { visible: true, sequence: 1 },
      expense_expenses: { visible: true, sequence: 2 },
      mrCarryStock_carrystockview: { visible: true, sequence: 1 },
      mrCarryStock_stockreturn: { visible: true, sequence: 2 },
      accounts_cashbank: { visible: true, sequence: 1 },
      accounts_mrcash: { visible: true, sequence: 2 },
      hrm_dashboard: { visible: true, sequence: 1 },
      hrm_holidays: { visible: true, sequence: 2 },
      hrm_leaveattendance: { visible: true, sequence: 3 },
      hrm_payroll: { visible: true, sequence: 4 },
      hrm_mrbasicpayroll: { visible: true, sequence: 5 },
      reports_dailyreport: { visible: true, sequence: 1 },
      reports_averageprice: { visible: true, sequence: 2 },
      reports_newcustomeraddition: { visible: true, sequence: 3 },
      reports_masterCustomerReports: { visible: true, sequence: 4 },
      reports_monthlyrepeatrate: { visible: true, sequence: 5 },
      reports_annualrepeatrate: { visible: true, sequence: 6 },
      reports_productreport: { visible: true, sequence: 7 },
      reports_mrwiseoutstanding: { visible: true, sequence: 8 },
      reports_mrwisesales: { visible: true, sequence: 9 },
      reports_cashsales: { visible: true, sequence: 10 },
      reports_outstandingcollection: { visible: true, sequence: 11 },
      reports_totalexpense: { visible: true, sequence: 12 },
      reports_remittance: { visible: true, sequence: 13 },
      reports_provincewisesale: { visible: true, sequence: 14 },
      reports_provincewisecustomer: { visible: true, sequence: 15 },
      reports_profitloss: { visible: true, sequence: 16 },
      reports_financeReports: { visible: true, sequence: 17 },
      reports_reportsinhand: { visible: true, sequence: 18 },
      reports_salesummary: { visible: true, sequence: 19 },
      reports_dailysample: { visible: true, sequence: 20 },
      reports_expirystock: { visible: true, sequence: 21 },
      masterCustomerReports_retention: { visible: true, sequence: 1 },
      masterCustomerReports_acceptance: { visible: true, sequence: 2 },
      masterCustomerReports_zonewise: { visible: true, sequence: 3 },
      financeReports_salessalary: { visible: true, sequence: 1 },
      financeReports_salarycogs: { visible: true, sequence: 2 },
      financeReports_operationcostcogs: { visible: true, sequence: 3 },
      financeReports_operationcostsales: { visible: true, sequence: 4 },
      financeReports_tourexpensesales: { visible: true, sequence: 5 },
    };
  },
};

const mrCarryStockPaths = [
  "/mrcarrystocklayout/carrystockview",
  "/mrcarrystocklayout/stockreturn",
];
const masterPaths = ["/masterlayout/customer", "/masterlayout/supplier"];
const purchasePaths = [
  "/purchaselayout/purchase",
  "/purchaselayout/purchasereturn",
  "/purchaselayout/purchaseout",
];
const productPaths = [
  "/productmanagerlayout/brands",
  "/productmanagerlayout/categories",
  "/productmanagerlayout/product",
  "/productmanagerlayout/pricelist",
  "/productmanagerlayout/printbarcode",
];
const hrmPaths = [
  "/hrmlayout/dashboard",
  "/hrmlayout/holidays",
  "/hrmlayout/leaveattendance",
  "/hrmlayout/payroll",
  "/hrmlayout/mrbasicpayroll",
];
const salesPaths = [
  "/salelayout/sale",
  "/salelayout/salereturn",
  "/salelayout/payment",
  "/salelayout/quotation",
];
const expensePaths = [
  "/expenselayout/expensecategories",
  "/expenselayout/expenses",
];
const accountPaths = ["/accountlayout", "/accountlayout/mrcash"];
const reportPaths = [
  "/reportlayout/dailyreport",
  "/reportlayout/averageprice",
  "/reportlayout/newcustomeraddition",
  "/reportlayout/customerretention",
  "/reportlayout/customeracceptance",
  "/reportlayout/zonewisecustomers",
  "/reportlayout/monthlyrepeatrate",
  "/reportlayout/annualrepeatrate",
  "/reportlayout/salesummary",
  "/reportlayout/dailysample",
  "/reportlayout/productsalessummary",
  "/reportlayout/stockalert",
  "/reportlayout/expensereport",
  "/reportlayout/userreport",
  "/reportlayout/ratelist",
  "/reportlayout/profitloss",
  "/reportlayout/mrwiseoutstanding",
  "/reportlayout/mrwisesales",
  "/reportlayout/cashsales",
  "/reportlayout/outstandingcollection",
  "/reportlayout/totalexpense",
  "/reportlayout/remittance",
  "/reportlayout/province-wise-sale",
  "/reportlayout/province-wise-customer",
  "/reportlayout/reports-in-hand",
  "/reportlayout/product-performance",
  "/reportlayout/stock-movement",
  "/reportlayout/slow-moving-items",
  "/reportlayout/product-profitability",
  "/reportlayout/product-report",
  "/reportlayout/expiry-stock-report",
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
const masterCustomerReportPaths = [
  "/reportlayout/customerretention",
  "/reportlayout/customeracceptance",
  "/reportlayout/zonewisecustomers",
  "/reportlayout/monthlyrepeatrate",
  "/reportlayout/annualrepeatrate",
];
const settingsPaths = [
  "/settinglayout/companyprofile",
  "/settinglayout/tabHideView",
];
const utilityPaths = [
  "/utilitylayout/companyprofile",
  "/utilitylayout/tabHideView",
];

function Sidebar({ isOpen, toggleSidebar, openSettingsSidebar }) {
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(false);

  const [activeParentMenu, setActiveParentMenu] = useState(null);
  const [activeSubMenu, setActiveSubMenu] = useState(null);
  const [activeFinanceSubMenu, setActiveFinanceSubMenu] = useState(null);
  const [activeReportsInHandSubMenu, setActiveReportsInHandSubMenu] =
    useState(null);
  const [activeProductReportSubMenu, setActiveProductReportSubMenu] =
    useState(null);
  const [visibleTabs, setVisibleTabs] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (isMobile && isOpen) {
      toggleSidebar();
    }
  }, [location.pathname]);

  const refreshTabData = React.useCallback(() => setLastUpdate(Date.now()), []);

  useEffect(() => {
    const loadVisibleTabs = async () => {
      setLoading(true);
      try {
        const tabs = await tabService.getVisibleTabs();
        setVisibleTabs(tabs);
      } catch (error) {
        setVisibleTabs(tabService.getDefaultVisibleTabs());
      } finally {
        setLoading(false);
      }
    };
    loadVisibleTabs();
  }, [lastUpdate]);

  useEffect(() => {
    if (location.pathname.startsWith("/masterlayout"))
      setActiveParentMenu("master");
    else if (location.pathname.startsWith("/productmanagerlayout"))
      setActiveParentMenu("products");
    else if (location.pathname.startsWith("/purchaselayout"))
      setActiveParentMenu("purchase");
    else if (location.pathname.startsWith("/salelayout"))
      setActiveParentMenu("sales");
    else if (location.pathname.startsWith("/expenselayout"))
      setActiveParentMenu("expense");
    else if (location.pathname.startsWith("/reportlayout")) {
      setActiveParentMenu("reports");
      if (
        masterCustomerReportPaths.some((p) => location.pathname.startsWith(p))
      )
        setActiveSubMenu("masterCustomerReports");
      if (financeReportPaths.some((p) => location.pathname.startsWith(p)))
        setActiveFinanceSubMenu("financeReports");
      if (reportsInHandPaths.some((p) => location.pathname.startsWith(p)))
        setActiveReportsInHandSubMenu("reportsInHand");
      if (productReportPaths.some((p) => location.pathname.startsWith(p)))
        setActiveProductReportSubMenu("productReports");
    } else if (location.pathname.startsWith("/utilitylayout"))
      setActiveParentMenu("utility");
    else if (location.pathname.startsWith("/hrmlayout"))
      setActiveParentMenu("hrm");
    else if (location.pathname.startsWith("/accountlayout"))
      setActiveParentMenu("accounts");
    else if (location.pathname.startsWith("/settingslayout"))
      setActiveParentMenu("settings");
    else if (location.pathname.startsWith("/mrcarrystocklayout"))
      setActiveParentMenu("mrCarryStock");
    else setActiveParentMenu(null);
  }, [location.pathname]);

  useEffect(() => {
    const handleTabVisibilityChange = () => refreshTabData();
    window.addEventListener("tabVisibilityChanged", handleTabVisibilityChange);
    return () =>
      window.removeEventListener(
        "tabVisibilityChanged",
        handleTabVisibilityChange,
      );
  }, [refreshTabData]);

  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === "tabVisibilityUpdated") refreshTabData();
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [refreshTabData]);

  const isActive = (path) => location.pathname === path;
  const isChildActive = (paths) =>
    paths.some((p) => location.pathname.startsWith(p));
  const toggleMenu = (menuKey) =>
    setActiveParentMenu((prev) => (prev === menuKey ? null : menuKey));
  const toggleSubMenu = (subMenuKey) =>
    setActiveSubMenu((prev) => (prev === subMenuKey ? null : subMenuKey));
  const toggleFinanceSubMenu = (subMenuKey) =>
    setActiveFinanceSubMenu((prev) =>
      prev === subMenuKey ? null : subMenuKey,
    );
  const toggleReportsInHandSubMenu = (subMenuKey) =>
    setActiveReportsInHandSubMenu((prev) =>
      prev === subMenuKey ? null : subMenuKey,
    );
  const toggleProductReportSubMenu = (subMenuKey) =>
    setActiveProductReportSubMenu((prev) =>
      prev === subMenuKey ? null : subMenuKey,
    );

  const shouldShowTab = (tabId) => {
    if (loading) return true;
    const tabConfig = visibleTabs[tabId];
    if (tabConfig === undefined || tabConfig === null) return false;
    if (typeof tabConfig === "object" && tabConfig !== null)
      return tabConfig.visible === true;
    return tabConfig === true;
  };

  const getLinkClass = (path) =>
    `flex items-center gap-3 p-2 rounded transition-all duration-150 ${
      isActive(path)
        ? "bg-gray-500 text-white shadow-md"
        : "hover:bg-gray-700 text-gray-200"
    }`;

  const getChildLinkClass = (path) =>
    `flex items-center gap-3 p-2 rounded transition-all duration-150 ${
      isActive(path)
        ? "bg-gray-500 text-white shadow-md"
        : "hover:bg-gray-600 text-gray-200"
    }`;

  const getDropdownButtonClass = (key, paths) =>
    `flex items-center justify-between w-full p-2 rounded-md transition-all duration-150 ${
      activeParentMenu === key ||
      (activeParentMenu === key && isChildActive(paths))
        ? "bg-blue-300 text-gray-900 shadow-lg"
        : "hover:bg-gray-700 text-gray-200"
    }`;

  const getSubDropdownButtonClass = (key, paths) =>
    `flex items-center justify-between w-full p-2 rounded-md transition-all duration-150 ${
      activeSubMenu === key || (activeSubMenu === key && isChildActive(paths))
        ? "bg-blue-200 text-gray-900 shadow-md"
        : "hover:bg-gray-600 text-gray-200"
    }`;

  const getFinanceSubDropdownButtonClass = (key, paths) =>
    `flex items-center justify-between w-full p-2 rounded-md transition-all duration-150 ${
      activeFinanceSubMenu === key ||
      (activeFinanceSubMenu === key && isChildActive(paths))
        ? "bg-blue-200 text-gray-900 shadow-md"
        : "hover:bg-gray-600 text-gray-200"
    }`;

  const getSortedTabs = (tabIds) =>
    tabIds
      .filter((tabId) => shouldShowTab(tabId))
      .sort(
        (a, b) =>
          (visibleTabs[a]?.sequence || 0) - (visibleTabs[b]?.sequence || 0),
      );

  // On mobile: sidebar is a fixed overlay. On desktop: it's a static sidebar.
  // isOpen controls visibility on mobile AND collapsed/expanded on desktop.

  if (loading) {
    return (
      <>
        {/* Mobile hamburger button when sidebar is loading */}
        {isMobile && (
          <button
            onClick={toggleSidebar}
            className="fixed top-3 left-3 z-50 p-2 bg-gray-900 text-white rounded-md"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div
          className={`
            ${
              isMobile
                ? `fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ${isOpen ? "translate-x-0" : "-translate-x-full"}`
                : `bg-gray-900 text-white transition-all duration-300 ${isOpen ? "w-64" : "w-16"} flex flex-col`
            }
            bg-gray-900 text-white flex flex-col
          `}
        >
          <div className="w-full h-16 flex items-center justify-center border-b border-gray-700 bg-gray-900">
            <img
              src="/mainlogo.png"
              alt="CRM Logo"
              className={`${isOpen ? "h-10" : "h-8"} object-contain`}
            />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-400">Loading...</div>
          </div>
        </div>
      </>
    );
  }

  const sidebarContent = (
    <div className="bg-gray-900 text-white flex flex-col h-full">
      {/* Logo + close button on mobile */}
      <div className="w-full h-16 flex items-center justify-between px-3 border-b border-gray-700 bg-gray-900 flex-shrink-0">
        <img
          src="/mainlogo.png"
          alt="CRM Logo"
          className={`${isOpen ? "h-10" : "h-8"} object-contain`}
        />
        {/* Close button - only on mobile when open */}
        {isMobile && isOpen && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation - scrollable */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-2">
        {/* Dashboard */}
        {shouldShowTab("dashboard") && (
          <Link to="/" className={getLinkClass("/")}>
            <Home className="w-5 h-5 flex-shrink-0" />
            {isOpen && <span>Dashboard</span>}
          </Link>
        )}

        {/* Master */}
        {shouldShowTab("master") && (
          <div>
            <button
              onClick={() => toggleMenu("master")}
              className={getDropdownButtonClass("master", masterPaths)}
            >
              <span className="flex items-center gap-3">
                <Users className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>Master</span>}
              </span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeParentMenu === "master" ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {activeParentMenu === "master" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {shouldShowTab("master_customers") && (
                  <Link
                    to="/masterlayout/customer"
                    className={getChildLinkClass("/masterlayout/customer")}
                  >
                    <Users className="w-4 h-4 flex-shrink-0" />
                    <span>Customers</span>
                  </Link>
                )}
                {shouldShowTab("master_suppliers") && (
                  <Link
                    to="/masterlayout/supplier"
                    className={getChildLinkClass("/masterlayout/supplier")}
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
        {shouldShowTab("settings") && (
          <div>
            <button
              onClick={() => toggleMenu("settings")}
              className={getDropdownButtonClass("settings", [
                "/settingslayout/company-profile",
                "/settingslayout/tab-manipulation",
              ])}
            >
              <span className="flex items-center gap-3">
                <Settings className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>Settings</span>}
              </span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeParentMenu === "settings" ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {activeParentMenu === "settings" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {shouldShowTab("settings_companyprofile") && (
                  <Link
                    to="/settingslayout/company-profile"
                    className={getChildLinkClass(
                      "/settingslayout/company-profile",
                    )}
                  >
                    <Building className="w-4 h-4 flex-shrink-0" />
                    <span>Company Profile</span>
                  </Link>
                )}
                {shouldShowTab("settings_tabmanipulation") && (
                  <Link
                    to="/settingslayout/tab-manipulation"
                    className={getChildLinkClass(
                      "/settingslayout/tab-manipulation",
                    )}
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
        {shouldShowTab("products") && (
          <div>
            <button
              onClick={() => toggleMenu("products")}
              className={getDropdownButtonClass("products", productPaths)}
            >
              <span className="flex items-center gap-3">
                <Package className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>Product Manager</span>}
              </span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeParentMenu === "products" ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {activeParentMenu === "products" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs(["products_products", "products_pricelist"]).map(
                  (tabId) => {
                    if (tabId === "products_products")
                      return (
                        <Link
                          key={tabId}
                          to="/productmanagerlayout/product"
                          className={getChildLinkClass(
                            "/productmanagerlayout/product",
                          )}
                        >
                          <Boxes className="w-4 h-4 flex-shrink-0" />
                          <span>Products</span>
                        </Link>
                      );
                    if (tabId === "products_pricelist")
                      return (
                        <Link
                          key={tabId}
                          to="/productmanagerlayout/pricelist"
                          className={getChildLinkClass(
                            "/productmanagerlayout/pricelist",
                          )}
                        >
                          <ClipboardList className="w-4 h-4 flex-shrink-0" />
                          <span>Price List</span>
                        </Link>
                      );
                    return null;
                  },
                )}
              </div>
            )}
          </div>
        )}

        {/* Purchase */}
        {shouldShowTab("purchase") && (
          <div>
            <button
              onClick={() => toggleMenu("purchase")}
              className={getDropdownButtonClass("purchase", purchasePaths)}
            >
              <span className="flex items-center gap-3">
                <ShoppingCart className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>Purchase</span>}
              </span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeParentMenu === "purchase" ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {activeParentMenu === "purchase" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs([
                  "purchase_purchase",
                  "purchase_purchasereturn",
                  "purchase_purchaseout",
                ]).map((tabId) => {
                  const map = {
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
                  const { to, icon: Icon, label } = map[tabId] || {};
                  return to ? (
                    <Link key={tabId} to={to} className={getChildLinkClass(to)}>
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{label}</span>
                    </Link>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Sales */}
        {shouldShowTab("sales") && (
          <div>
            <button
              onClick={() => toggleMenu("sales")}
              className={getDropdownButtonClass("sales", salesPaths)}
            >
              <span className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>Sales</span>}
              </span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeParentMenu === "sales" ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {activeParentMenu === "sales" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs(["sales_sale", "sales_salereturn"]).map(
                  (tabId) => {
                    const map = {
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
                    const { to, icon: Icon, label } = map[tabId] || {};
                    return to ? (
                      <Link
                        key={tabId}
                        to={to}
                        className={getChildLinkClass(to)}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span>{label}</span>
                      </Link>
                    ) : null;
                  },
                )}
              </div>
            )}
          </div>
        )}

        {/* Stock Adjustment */}
        {shouldShowTab("stockAdjustment") && (
          <Link
            to="/stockadjustment"
            className={getLinkClass("/stockadjustment")}
          >
            <ListChecks className="w-5 h-5 flex-shrink-0" />
            {isOpen && <span>Stock Adjustment</span>}
          </Link>
        )}

        {/* Stock Transfer */}
        {shouldShowTab("stockTransfer") && (
          <Link to="/stocktransfer" className={getLinkClass("/stocktransfer")}>
            <Truck className="w-5 h-5 flex-shrink-0" />
            {isOpen && <span>Stock Transfer</span>}
          </Link>
        )}

        {/* MR Carry Stock */}
        {shouldShowTab("mrCarryStock") && (
          <div>
            <button
              onClick={() => toggleMenu("mrCarryStock")}
              className={getDropdownButtonClass(
                "mrCarryStock",
                mrCarryStockPaths,
              )}
            >
              <span className="flex items-center gap-3">
                <BriefcaseMedical className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>MR Carry Stock</span>}
              </span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeParentMenu === "mrCarryStock" ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {activeParentMenu === "mrCarryStock" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs([
                  "mrCarryStock_carrystockview",
                  "mrCarryStock_stockreturn",
                ]).map((tabId) => {
                  const map = {
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
                  const { to, icon: Icon, label } = map[tabId] || {};
                  return to ? (
                    <Link key={tabId} to={to} className={getChildLinkClass(to)}>
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{label}</span>
                    </Link>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Accounts */}
        {shouldShowTab("accounts") && (
          <div>
            <button
              onClick={() => toggleMenu("accounts")}
              className={getDropdownButtonClass("accounts", accountPaths)}
            >
              <span className="flex items-center gap-3">
                <Landmark className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>Accounts</span>}
              </span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeParentMenu === "accounts" ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {activeParentMenu === "accounts" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs(["accounts_cashbank", "accounts_mrcash"]).map(
                  (tabId) => {
                    const map = {
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
                    const { to, icon: Icon, label } = map[tabId] || {};
                    return to ? (
                      <Link
                        key={tabId}
                        to={to}
                        className={getChildLinkClass(to)}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
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
        {shouldShowTab("expense") && (
          <div>
            <button
              onClick={() => toggleMenu("expense")}
              className={getDropdownButtonClass("expense", expensePaths)}
            >
              <span className="flex items-center gap-3">
                <FileText className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>Expense</span>}
              </span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeParentMenu === "expense" ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {activeParentMenu === "expense" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs(["expense_categories", "expense_expenses"]).map(
                  (tabId) => {
                    const map = {
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
                    const { to, icon: Icon, label } = map[tabId] || {};
                    return to ? (
                      <Link
                        key={tabId}
                        to={to}
                        className={getChildLinkClass(to)}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
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
        {shouldShowTab("reports") && (
          <div>
            <button
              onClick={() => toggleMenu("reports")}
              className={getDropdownButtonClass("reports", reportPaths)}
            >
              <span className="flex items-center gap-3">
                <BarChart3 className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>Reports</span>}
              </span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeParentMenu === "reports" ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {activeParentMenu === "reports" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs([
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
                  "reports_totalexpense",
                  "reports_remittance",
                  "reports_provincewisesale",
                  "reports_provincewisecustomer",
                  "reports_profitloss",
                  "reports_financeReports",
                  "reports_reportsinhand",
                  "reports_salesummary",
                  "reports_dailysample",
                  "reports_expirystock",
                ]).map((tabId) => {
                  if (
                    tabId === "reports_masterCustomerReports" &&
                    shouldShowTab("reports_masterCustomerReports")
                  ) {
                    return (
                      <div key={tabId}>
                        <button
                          onClick={() => toggleSubMenu("masterCustomerReports")}
                          className={getSubDropdownButtonClass(
                            "masterCustomerReports",
                            masterCustomerReportPaths,
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <Users className="w-4 h-4 flex-shrink-0" />
                            <span>Master Customer Report</span>
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeSubMenu === "masterCustomerReports" ? "rotate-180" : ""}`}
                          />
                        </button>
                        {activeSubMenu === "masterCustomerReports" && (
                          <div className="ml-4 mt-1 space-y-1">
                            {getSortedTabs([
                              "masterCustomerReports_retention",
                              "masterCustomerReports_acceptance",
                              "masterCustomerReports_zonewise",
                            ]).map((subTabId) => {
                              const map = {
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
                              const {
                                to,
                                icon: Icon,
                                label,
                              } = map[subTabId] || {};
                              return to ? (
                                <Link
                                  key={subTabId}
                                  to={to}
                                  className={getChildLinkClass(to)}
                                >
                                  <Icon className="w-4 h-4 flex-shrink-0" />
                                  <span>{label}</span>
                                </Link>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (
                    tabId === "reports_financeReports" &&
                    shouldShowTab("reports_financeReports")
                  ) {
                    return (
                      <div key={tabId}>
                        <button
                          onClick={() => toggleFinanceSubMenu("financeReports")}
                          className={getFinanceSubDropdownButtonClass(
                            "financeReports",
                            financeReportPaths,
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <FileBarChart className="w-4 h-4 flex-shrink-0" />
                            <span>Finance Reports</span>
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeFinanceSubMenu === "financeReports" ? "rotate-180" : ""}`}
                          />
                        </button>
                        {activeFinanceSubMenu === "financeReports" && (
                          <div className="ml-4 mt-1 space-y-1">
                            {getSortedTabs([
                              "financeReports_salessalary",
                              "financeReports_salarycogs",
                              "financeReports_operationcostcogs",
                              "financeReports_operationcostsales",
                              "financeReports_tourexpensesales",
                            ]).map((subTabId) => {
                              const linkMap = {
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
                              const iconMap = {
                                financeReports_salessalary: Percent,
                                financeReports_salarycogs: Scale,
                                financeReports_operationcostcogs: TrendingDown,
                                financeReports_operationcostsales: BarChart3,
                                financeReports_tourexpensesales: MapPin,
                              };
                              const Icon = iconMap[subTabId];
                              const path = linkMap[subTabId];
                              return path ? (
                                <Link
                                  key={subTabId}
                                  to={path}
                                  className={getChildLinkClass(path)}
                                >
                                  <Icon className="w-4 h-4 flex-shrink-0" />
                                  <span>{formatTabLabel(subTabId)}</span>
                                </Link>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (tabId === "reports_profitloss") {
                    return (
                      <Link
                        key={tabId}
                        to="/reportlayout/profitloss"
                        className={getChildLinkClass(
                          "/reportlayout/profitloss",
                        )}
                      >
                        <DollarSign className="w-4 h-4 flex-shrink-0" />
                        <span>Profit Loss</span>
                      </Link>
                    );
                  }

                  const linkMap = {
                    reports_dailyreport: "/reportlayout/dailyreport",
                    reports_averageprice: "/reportlayout/averageprice",
                    reports_newcustomeraddition:
                      "/reportlayout/newcustomeraddition",
                    reports_monthlyrepeatrate:
                      "/reportlayout/monthlyrepeatrate",
                    reports_annualrepeatrate: "/reportlayout/annualrepeatrate",
                    reports_productreport: "/reportlayout/product-report",
                    reports_mrwiseoutstanding:
                      "/reportlayout/mrwiseoutstanding",
                    reports_mrwisesales: "/reportlayout/mrwisesales",
                    reports_cashsales: "/reportlayout/cashsales",
                    reports_outstandingcollection:
                      "/reportlayout/outstandingcollection",
                    reports_totalexpense: "/reportlayout/totalexpense",
                    reports_remittance: "/reportlayout/remittance",
                    reports_provincewisesale:
                      "/reportlayout/province-wise-sale",
                    reports_provincewisecustomer:
                      "/reportlayout/province-wise-customer",
                    reports_reportsinhand: "/reportlayout/reports-in-hand",
                    reports_salesummary: "/reportlayout/salesummary",
                    reports_dailysample: "/reportlayout/dailysample",
                    reports_expirystock: "/reportlayout/expiry-stock-report",
                  };
                  const iconMap = {
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
                    reports_totalexpense: PieChart,
                    reports_remittance: Coins,
                    reports_provincewisesale: Globe,
                    reports_provincewisecustomer: Users,
                    reports_reportsinhand: HandCoins,
                    reports_salesummary: TrendingUp,
                    reports_dailysample: Boxes,
                    reports_expirystock: Clock,
                  };
                  const Icon = iconMap[tabId];
                  const path = linkMap[tabId];
                  return Icon && path ? (
                    <Link
                      key={tabId}
                      to={path}
                      className={getChildLinkClass(path)}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{formatTabLabel(tabId)}</span>
                    </Link>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Utility */}
        {shouldShowTab("utility") && (
          <div>
            <button
              onClick={() => toggleMenu("utility")}
              className={getDropdownButtonClass("utility", utilityPaths)}
            >
              <span className="flex items-center gap-3">
                <Settings className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>Settings</span>}
              </span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeParentMenu === "utility" ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {activeParentMenu === "utility" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs([
                  "utility_companyprofile",
                  "utility_tabhideview",
                ]).map((tabId) => {
                  const map = {
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
                  const { to, icon: Icon, label } = map[tabId] || {};
                  return to ? (
                    <Link key={tabId} to={to} className={getChildLinkClass(to)}>
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{label}</span>
                    </Link>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {/* HRM */}
        {shouldShowTab("hrm") && (
          <div>
            <button
              onClick={() => toggleMenu("hrm")}
              className={getDropdownButtonClass("hrm", hrmPaths)}
            >
              <span className="flex items-center gap-3">
                <UserCog className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>HRM</span>}
              </span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform flex-shrink-0 ${activeParentMenu === "hrm" ? "rotate-180" : ""}`}
                />
              )}
            </button>
            {activeParentMenu === "hrm" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs([
                  "hrm_dashboard",
                  "hrm_holidays",
                  "hrm_leaveattendance",
                  "hrm_payroll",
                  "hrm_mrbasicpayroll",
                ]).map((tabId) => {
                  const map = {
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
                  const { to, icon: Icon, label } = map[tabId] || {};
                  return to ? (
                    <Link key={tabId} to={to} className={getChildLinkClass(to)}>
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{label}</span>
                    </Link>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  );

  // MOBILE: fixed overlay drawer
  if (isMobile) {
    return (
      <>
        {/* Hamburger button - always visible on mobile */}
        <button
          onClick={toggleSidebar}
          className="fixed top-3 left-3 z-50 p-2 bg-gray-900 text-white rounded-md shadow-lg"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-30"
            onClick={toggleSidebar}
            aria-hidden="true"
          />
        )}

        {/* Drawer */}
        <div
          className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ease-in-out ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebarContent}
        </div>
      </>
    );
  }

  // DESKTOP: static sidebar (collapsed or expanded)
  return (
    <div
      className={`bg-gray-900 text-white transition-all duration-300 ${
        isOpen ? "w-64" : "w-16"
      } flex flex-col flex-shrink-0`}
    >
      {sidebarContent}
    </div>
  );
}

export default Sidebar;
