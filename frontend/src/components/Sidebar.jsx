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
} from "lucide-react";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// API service for tab management
const tabService = {
  async getVisibleTabs() {
    try {
      const response = await fetch(`${backendUrl}/api/h-tabs/visible`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
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

      if (data.data && typeof data.data === "object") {
        return data.data;
      }

      return data.data || {};
    } catch (error) {
      return this.getDefaultVisibleTabs();
    }
  },

  async updateTabVisibility(tabUpdates) {
    try {
      const response = await fetch(`${backendUrl}/api/h-tabs/visibility`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ updates: tabUpdates }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  },

  getDefaultVisibleTabs() {
    return {
      // Main tabs
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

      // Master sub-tabs
      master_customers: { visible: true, sequence: 1 },
      master_suppliers: { visible: true, sequence: 2 },

      // Products sub-tabs
      products_products: { visible: true, sequence: 1 },
      products_pricelist: { visible: true, sequence: 2 },

      // Purchase sub-tabs
      purchase_purchase: { visible: true, sequence: 1 },
      purchase_purchasereturn: { visible: true, sequence: 2 },
      purchase_purchaseout: { visible: true, sequence: 3 },

      // Sales sub-tabs
      sales_sale: { visible: true, sequence: 1 },
      sales_salereturn: { visible: true, sequence: 2 },

      // Expense sub-tabs
      expense_categories: { visible: true, sequence: 1 },
      expense_expenses: { visible: true, sequence: 2 },

      // NEW: MR Carry Stock sub-tabs

      mrCarryStock_carrystockview: { visible: true, sequence: 1 },
      mrCarryStock_stockreturn: { visible: true, sequence: 2 },

      // Reports sub-tabs
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
      reports_payment: { visible: true, sequence: 16 },
      reports_financeReports: { visible: true, sequence: 17 },
      reports_reportsinhand: { visible: true, sequence: 18 },
      reports_salesummary: { visible: true, sequence: 19 },
      reports_dailysample: { visible: true, sequence: 20 },
      reports_profitloss: { visible: true, sequence: 21 },
      reports_expirystock: { visible: true, sequence: 22 },

      // Master Customer Report sub-tabs
      masterCustomerReports_retention: { visible: true, sequence: 1 },
      masterCustomerReports_acceptance: { visible: true, sequence: 2 },
      masterCustomerReports_zonewise: { visible: true, sequence: 3 },

      // Finance Reports sub-tabs
      financeReports_salessalary: { visible: true, sequence: 1 },
      financeReports_salarycogs: { visible: true, sequence: 2 },
      financeReports_operationcostcogs: { visible: true, sequence: 3 },
      financeReports_operationcostsales: { visible: true, sequence: 4 },
      financeReports_tourexpensesales: { visible: true, sequence: 5 },
      financeReports_plreport: { visible: true, sequence: 6 },

      // Settings sub-tabs
      settings_companyprofile: { visible: true, sequence: 1 },
      settings_tabmanipulation: { visible: true, sequence: 2 },

      // Utility sub-tabs
      utility_companyprofile: { visible: true, sequence: 1 },
      utility_tabhideview: { visible: true, sequence: 2 },

      // HRM sub-tabs - UPDATED: Changed from hrm_management to hrm_leaveattendance
      hrm_dashboard: { visible: true, sequence: 1 },
      hrm_holidays: { visible: true, sequence: 2 },
      hrm_leaveattendance: { visible: true, sequence: 3 },
      hrm_payroll: { visible: true, sequence: 4 },
      hrm_settings: { visible: true, sequence: 5 },
    };
  },
};

// NEW: MR Carry Stock paths
const mrCarryStockPaths = [
  "/mrcarrystocklayout/carrystockview",
  "/mrcarrystocklayout/stockreturn",
];

// Path constants
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

// UPDATED: Changed from /hrmlayout/management to /hrmlayout/leaveattendance
const hrmPaths = [
  "/hrmlayout/dashboard",
  "/hrmlayout/holidays",
  "/hrmlayout/leaveattendance", // Changed from /hrmlayout/management
  "/hrmlayout/payroll",
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

const reportPaths = [
  "/reportlayout/payment",
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
  "/reportlayout/pl-report",
  "/reportlayout/reports-in-hand",
  "/reportlayout/product-performance",
  "/reportlayout/stock-movement",
  "/reportlayout/slow-moving-items",
  "/reportlayout/product-profitability",
  "/reportlayout/product-report",
  "/reportlayout/expiry-stock-report",
];

// Finance Report paths
const financeReportPaths = [
  "/reportlayout/sales-salary-ratio",
  "/reportlayout/salary-cogs-ratio",
  "/reportlayout/operation-cost-cogs-ratio",
  "/reportlayout/operation-cost-sales-ratio",
  "/reportlayout/tour-expense-sales-ratio",
  "/reportlayout/pl-report",
];

// Reports in Hand paths
const reportsInHandPaths = ["/reportlayout/reports-in-hand"];

// Product Report paths
const productReportPaths = [
  "/reportlayout/product-performance",
  "/reportlayout/stock-movement",
  "/reportlayout/slow-moving-items",
  "/reportlayout/product-profitability",
  "/reportlayout/product-report",
];

// Master Customer Report paths
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

const accountPaths = ["/accountlayout"];

const utilityPaths = [
  "/utilitylayout/companyprofile",
  "/utilitylayout/tabHideView",
];

function Sidebar({ isOpen, toggleSidebar, openSettingsSidebar }) {
  const location = useLocation();

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

  // Function to refresh tab data
  const refreshTabData = React.useCallback(() => {
    setLastUpdate(Date.now());
  }, []);

  // Load visible tabs on component mount and when lastUpdate changes
  useEffect(() => {
    const loadVisibleTabs = async () => {
      setLoading(true);
      try {
        const tabs = await tabService.getVisibleTabs();
        setVisibleTabs(tabs);
      } catch (error) {
        console.error("Error loading tabs:", error);
        setVisibleTabs(tabService.getDefaultVisibleTabs());
      } finally {
        setLoading(false);
      }
    };

    loadVisibleTabs();
  }, [lastUpdate]);

  useEffect(() => {
    if (location.pathname.startsWith("/masterlayout")) {
      setActiveParentMenu("master");
    } else if (location.pathname.startsWith("/productmanagerlayout")) {
      setActiveParentMenu("products");
    } else if (location.pathname.startsWith("/purchaselayout")) {
      setActiveParentMenu("purchase");
    } else if (location.pathname.startsWith("/salelayout")) {
      setActiveParentMenu("sales");
    } else if (location.pathname.startsWith("/expenselayout")) {
      setActiveParentMenu("expense");
    } else if (location.pathname.startsWith("/reportlayout")) {
      setActiveParentMenu("reports");
      if (
        masterCustomerReportPaths.some((path) =>
          location.pathname.startsWith(path)
        )
      ) {
        setActiveSubMenu("masterCustomerReports");
      }
      if (
        financeReportPaths.some((path) => location.pathname.startsWith(path))
      ) {
        setActiveFinanceSubMenu("financeReports");
      }
      if (
        reportsInHandPaths.some((path) => location.pathname.startsWith(path))
      ) {
        setActiveReportsInHandSubMenu("reportsInHand");
      }
      if (
        productReportPaths.some((path) => location.pathname.startsWith(path))
      ) {
        setActiveProductReportSubMenu("productReports");
      }
    } else if (location.pathname.startsWith("/utilitylayout")) {
      setActiveParentMenu("utility");
    } else if (location.pathname.startsWith("/hrmlayout")) {
      setActiveParentMenu("hrm");
    } else if (location.pathname.startsWith("/accountlayout")) {
      setActiveParentMenu("accounts");
    } else if (location.pathname.startsWith("/settingslayout")) {
      setActiveParentMenu("settings");
    } else if (location.pathname.startsWith("/mrcarrystocklayout")) {
      setActiveParentMenu("mrCarryStock"); // NEW: Add MR Carry Stock detection
    } else {
      setActiveParentMenu(null);
    }
  }, [location.pathname]);

  // Add event listener for tab visibility changes
  useEffect(() => {
    const handleTabVisibilityChange = () => {
      refreshTabData();
    };

    window.addEventListener("tabVisibilityChanged", handleTabVisibilityChange);
    return () => {
      window.removeEventListener(
        "tabVisibilityChanged",
        handleTabVisibilityChange
      );
    };
  }, [refreshTabData]);

  // Also listen for storage changes as backup
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === "tabVisibilityUpdated") {
        refreshTabData();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [refreshTabData]);

  const isActive = (path) => location.pathname === path;
  const isChildActive = (paths) =>
    paths.some((p) => location.pathname.startsWith(p));

  const toggleMenu = (menuKey) => {
    setActiveParentMenu((prev) => (prev === menuKey ? null : menuKey));
  };

  const toggleSubMenu = (subMenuKey) => {
    setActiveSubMenu((prev) => (prev === subMenuKey ? null : subMenuKey));
  };

  const toggleFinanceSubMenu = (subMenuKey) => {
    setActiveFinanceSubMenu((prev) =>
      prev === subMenuKey ? null : subMenuKey
    );
  };

  const toggleReportsInHandSubMenu = (subMenuKey) => {
    setActiveReportsInHandSubMenu((prev) =>
      prev === subMenuKey ? null : subMenuKey
    );
  };

  const toggleProductReportSubMenu = (subMenuKey) => {
    setActiveProductReportSubMenu((prev) =>
      prev === subMenuKey ? null : subMenuKey
    );
  };

  const shouldShowTab = (tabId) => {
    if (loading) {
      return true;
    }

    const tabConfig = visibleTabs[tabId];

    if (tabConfig === undefined || tabConfig === null) {
      return false;
    }

    if (typeof tabConfig === "object" && tabConfig !== null) {
      return tabConfig.visible === true;
    }

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

  const getReportsInHandSubDropdownButtonClass = (key, paths) =>
    `flex items-center justify-between w-full p-2 rounded-md transition-all duration-150 ${
      activeReportsInHandSubMenu === key ||
      (activeReportsInHandSubMenu === key && isChildActive(paths))
        ? "bg-blue-200 text-gray-900 shadow-md"
        : "hover:bg-gray-600 text-gray-200"
    }`;

  const getProductReportSubDropdownButtonClass = (key, paths) =>
    `flex items-center justify-between w-full p-2 rounded-md transition-all duration-150 ${
      activeProductReportSubMenu === key ||
      (activeProductReportSubMenu === key && isChildActive(paths))
        ? "bg-blue-200 text-gray-900 shadow-md"
        : "hover:bg-gray-600 text-gray-200"
    }`;

  const getSortedTabs = (tabIds) => {
    const filteredTabs = tabIds
      .filter((tabId) => {
        const shouldShow = shouldShowTab(tabId);
        return shouldShow;
      })
      .sort((a, b) => {
        const seqA = visibleTabs[a]?.sequence || 0;
        const seqB = visibleTabs[b]?.sequence || 0;
        return seqA - seqB;
      });
    return filteredTabs;
  };

  if (loading) {
    return (
      <div
        className={`bg-gray-900 text-white transition-all duration-300 ${
          isOpen ? "w-64" : "w-16"
        } flex flex-col`}
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
    );
  }

  return (
    <div
      className={`bg-gray-900 text-white transition-all duration-300 ${
        isOpen ? "w-64" : "w-16"
      } flex flex-col`}
    >
      {/* Logo */}
      <div className="w-full h-16 flex items-center justify-center border-b border-gray-700 bg-gray-900">
        <img
          src="/mainlogo.png"
          alt="CRM Logo"
          className={`${isOpen ? "h-10" : "h-8"} object-contain`}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-2">
        {/* Dashboard */}
        {shouldShowTab("dashboard") && (
          <Link to="/" className={getLinkClass("/")}>
            <Home className="w-5 h-5" />
            {isOpen && <span className="mx-auto">Dashboard</span>}
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
                <Users className="w-5 h-5" />
              </span>
              <span>{isOpen && "Master"}</span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    activeParentMenu === "master" ? "rotate-180" : ""
                  }`}
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
                    <Users className="w-4 h-4" />
                    <span className="mx-auto">Customers</span>
                  </Link>
                )}
                {shouldShowTab("master_suppliers") && (
                  <Link
                    to="/masterlayout/supplier"
                    className={getChildLinkClass("/masterlayout/supplier")}
                  >
                    <Truck className="w-4 h-4" />
                    <span className="mx-auto">Suppliers</span>
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
                <Settings className="w-5 h-5" />
              </span>
              <span>{isOpen && "Settings"}</span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    activeParentMenu === "settings" ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>
            {activeParentMenu === "settings" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {shouldShowTab("settings_companyprofile") && (
                  <Link
                    to="/settingslayout/company-profile"
                    className={getChildLinkClass(
                      "/settingslayout/company-profile"
                    )}
                  >
                    <Building className="w-4 h-4" />
                    <span className="mx-auto">Company Profile</span>
                  </Link>
                )}
                {shouldShowTab("settings_tabmanipulation") && (
                  <Link
                    to="/settingslayout/tab-manipulation"
                    className={getChildLinkClass(
                      "/settingslayout/tab-manipulation"
                    )}
                  >
                    <Eye className="w-4 h-4" />
                    <span className="mx-auto">Tab Manipulation</span>
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
                <Package className="w-5 h-5" />
              </span>
              <span>{isOpen && "Product Manager"}</span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    activeParentMenu === "products" ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>
            {activeParentMenu === "products" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs(["products_products", "products_pricelist"]).map(
                  (tabId) => {
                    if (tabId === "products_products") {
                      return (
                        <Link
                          key={tabId}
                          to="/productmanagerlayout/product"
                          className={getChildLinkClass(
                            "/productmanagerlayout/product"
                          )}
                        >
                          <Boxes className="w-4 h-4" />
                          <span className="mx-auto">Products</span>
                        </Link>
                      );
                    } else if (tabId === "products_pricelist") {
                      return (
                        <Link
                          key={tabId}
                          to="/productmanagerlayout/pricelist"
                          className={getChildLinkClass(
                            "/productmanagerlayout/pricelist"
                          )}
                        >
                          <ClipboardList className="w-4 h-4" />
                          <span className="mx-auto">Price List</span>
                        </Link>
                      );
                    }
                    return null;
                  }
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
                <ShoppingCart className="w-5 h-5" />
              </span>
              <span>{isOpen && "Purchase"}</span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    activeParentMenu === "purchase" ? "rotate-180" : ""
                  }`}
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
                  if (tabId === "purchase_purchase") {
                    return (
                      <Link
                        key={tabId}
                        to="/purchaselayout/purchase"
                        className={getChildLinkClass(
                          "/purchaselayout/purchase"
                        )}
                      >
                        <Package className="w-4 h-4" />
                        <span className="mx-auto">Purchase</span>
                      </Link>
                    );
                  } else if (tabId === "purchase_purchasereturn") {
                    return (
                      <Link
                        key={tabId}
                        to="/purchaselayout/purchasereturn"
                        className={getChildLinkClass(
                          "/purchaselayout/purchasereturn"
                        )}
                      >
                        <FileText className="w-4 h-4" />
                        <span className="mx-auto">Purchase/Cr.Note</span>
                      </Link>
                    );
                  } else if (tabId === "purchase_purchaseout") {
                    return (
                      <Link
                        key={tabId}
                        to="/purchaselayout/purchaseout"
                        className={getChildLinkClass(
                          "/purchaselayout/purchaseout"
                        )}
                      >
                        <Truck className="w-4 h-4" />
                        <span className="mx-auto">Purchase Out</span>
                      </Link>
                    );
                  }
                  return null;
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
                <TrendingUp className="w-5 h-5" />
              </span>
              <span>{isOpen && "Sales"}</span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    activeParentMenu === "sales" ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>
            {activeParentMenu === "sales" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs(["sales_sale", "sales_salereturn"]).map(
                  (tabId) => {
                    if (tabId === "sales_sale") {
                      return (
                        <Link
                          key={tabId}
                          to="/salelayout/sale"
                          className={getChildLinkClass("/salelayout/sale")}
                        >
                          <DollarSign className="w-4 h-4" />
                          <span className="mx-auto">Sale</span>
                        </Link>
                      );
                    } else if (tabId === "sales_salereturn") {
                      return (
                        <Link
                          key={tabId}
                          to="/salelayout/salereturn"
                          className={getChildLinkClass(
                            "/salelayout/salereturn"
                          )}
                        >
                          <FileText className="w-4 h-4" />
                          <span className="mx-auto">Sale Return/Cr.Note</span>
                        </Link>
                      );
                    }
                    return null;
                  }
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
            <ListChecks className="w-5 h-5" />
            {isOpen && <span className="mx-auto">Stock Adjustment</span>}
          </Link>
        )}

        {/* Stock Transfer */}
        {shouldShowTab("stockTransfer") && (
          <Link to="/stocktransfer" className={getLinkClass("/stocktransfer")}>
            <Truck className="w-5 h-5" />
            {isOpen && <span className="mx-auto">Stock Transfer</span>}
          </Link>
        )}

        {/* NEW: MR Carry Stock */}
        {shouldShowTab("mrCarryStock") && (
          <div>
            <button
              onClick={() => toggleMenu("mrCarryStock")}
              className={getDropdownButtonClass(
                "mrCarryStock",
                mrCarryStockPaths
              )}
            >
              <span className="flex items-center gap-3">
                <BriefcaseMedical className="w-5 h-5" />
              </span>
              <span>{isOpen && "MR Carry Stock"}</span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    activeParentMenu === "mrCarryStock" ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>
            {activeParentMenu === "mrCarryStock" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs([
                  "mrCarryStock_carrystockview",
                  "mrCarryStock_stockreturn",
                ]).map((tabId) => {
                  const linkMap = {
                    mrCarryStock_carrystockview:
                      "/mrcarrystocklayout/carrystockview",
                    mrCarryStock_stockreturn: "/mrcarrystocklayout/stockreturn",
                  };

                  const iconMap = {
                    mrCarryStock_carrystockview: Eye,
                    mrCarryStock_stockreturn: RefreshCw,
                  };

                  const labelMap = {
                    mrCarryStock_carrystockview: "Carry Stock View",
                    mrCarryStock_stockreturn: "Stock Return",
                  };

                  const IconComponent = iconMap[tabId];
                  const path = linkMap[tabId];
                  const label = labelMap[tabId];

                  return (
                    <Link
                      key={tabId}
                      to={path}
                      className={getChildLinkClass(path)}
                    >
                      <IconComponent className="w-4 h-4" />
                      <span className="mx-auto">{label}</span>
                    </Link>
                  );
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
                <Landmark className="w-5 h-5" />
              </span>
              <span>{isOpen && "Accounts"}</span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    activeParentMenu === "accounts" ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>
            {activeParentMenu === "accounts" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                <Link
                  to="/accountlayout"
                  className={getChildLinkClass("/accountlayout")}
                >
                  <Wallet className="w-4 h-4" />
                  <span className="mx-auto">Cash & Bank</span>
                </Link>
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
                <FileText className="w-5 h-5" />
              </span>
              <span>{isOpen && "Expense"}</span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    activeParentMenu === "expense" ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>
            {activeParentMenu === "expense" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs(["expense_categories", "expense_expenses"]).map(
                  (tabId) => {
                    if (tabId === "expense_categories") {
                      return (
                        <Link
                          key={tabId}
                          to="/expenselayout/expensecategories"
                          className={getChildLinkClass(
                            "/expenselayout/expensecategories"
                          )}
                        >
                          <Layers className="w-4 h-4" />
                          <span className="mx-auto">Expense Categories</span>
                        </Link>
                      );
                    } else if (tabId === "expense_expenses") {
                      return (
                        <Link
                          key={tabId}
                          to="/expenselayout/expenses"
                          className={getChildLinkClass(
                            "/expenselayout/expenses"
                          )}
                        >
                          <DollarSign className="w-4 h-4" />
                          <span className="mx-auto">Expenses</span>
                        </Link>
                      );
                    }
                    return null;
                  }
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
                <BarChart3 className="w-5 h-5" />
              </span>
              <span>{isOpen && "Reports"}</span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    activeParentMenu === "reports" ? "rotate-180" : ""
                  }`}
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
                  "reports_payment",
                  "reports_financeReports",
                  "reports_reportsinhand",
                  "reports_salesummary",
                  "reports_dailysample",
                  "reports_profitloss",
                  "reports_expirystockreport",
                ]).map((tabId) => {
                  // Handle master customer reports dropdown
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
                            masterCustomerReportPaths
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <Users className="w-4 h-4" />
                            <span>Master Customer Report</span>
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 transform transition-transform ${
                              activeSubMenu === "masterCustomerReports"
                                ? "rotate-180"
                                : ""
                            }`}
                          />
                        </button>
                        {activeSubMenu === "masterCustomerReports" && (
                          <div className="ml-4 mt-1 space-y-1">
                            {getSortedTabs([
                              "masterCustomerReports_retention",
                              "masterCustomerReports_acceptance",
                              "masterCustomerReports_zonewise",
                            ]).map((subTabId) => {
                              if (
                                subTabId === "masterCustomerReports_retention"
                              ) {
                                return (
                                  <Link
                                    key={subTabId}
                                    to="/reportlayout/customerretention"
                                    className={getChildLinkClass(
                                      "/reportlayout/customerretention"
                                    )}
                                  >
                                    <Repeat className="w-4 h-4" />
                                    <span>Customer Retention Rate</span>
                                  </Link>
                                );
                              } else if (
                                subTabId === "masterCustomerReports_acceptance"
                              ) {
                                return (
                                  <Link
                                    key={subTabId}
                                    to="/reportlayout/customeracceptance"
                                    className={getChildLinkClass(
                                      "/reportlayout/customeracceptance"
                                    )}
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                    <span>Product Acceptance Rate</span>
                                  </Link>
                                );
                              } else if (
                                subTabId === "masterCustomerReports_zonewise"
                              ) {
                                return (
                                  <Link
                                    key={tabId}
                                    to="/reportlayout/zonewisecustomers"
                                    className={getChildLinkClass(
                                      "/reportlayout/zonewisecustomers"
                                    )}
                                  >
                                    <MapPin className="w-4 h-4" />
                                    <span>Zone Wise Customers</span>
                                  </Link>
                                );
                              }
                              return null;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Handle finance reports dropdown
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
                            financeReportPaths
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <FileBarChart className="w-4 h-4" />
                            <span>Finance Reports</span>
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 transform transition-transform ${
                              activeFinanceSubMenu === "financeReports"
                                ? "rotate-180"
                                : ""
                            }`}
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
                              "financeReports_plreport",
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
                                financeReports_plreport:
                                  "/reportlayout/pl-report",
                              };

                              const iconMap = {
                                financeReports_salessalary: Percent,
                                financeReports_salarycogs: Scale,
                                financeReports_operationcostcogs: TrendingDown,
                                financeReports_operationcostsales: BarChart3,
                                financeReports_tourexpensesales: MapPin,
                                financeReports_plreport: FileBarChart,
                              };

                              const IconComponent = iconMap[subTabId];
                              const path = linkMap[subTabId];

                              return (
                                <Link
                                  key={subTabId}
                                  to={path}
                                  className={getChildLinkClass(path)}
                                >
                                  <IconComponent className="w-4 h-4" />
                                  <span>
                                    {subTabId
                                      .split("_")[1]
                                      .replace(/([A-Z])/g, " $1")
                                      .trim()}
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Handle regular report links
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
                    reports_payment: "/reportlayout/payment",
                    reports_reportsinhand: "/reportlayout/reports-in-hand",
                    reports_salesummary: "/reportlayout/salesummary",
                    reports_dailysample: "/reportlayout/dailysample",
                    reports_profitloss: "/reportlayout/profitloss",
                    reports_expirystockreport:
                      "/reportlayout/expiry-stock-report",
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
                    reports_payment: CreditCard,
                    reports_reportsinhand: HandCoins,
                    reports_salesummary: TrendingUp,
                    reports_dailysample: Boxes,
                    reports_profitloss: DollarSign,
                    reports_expirystockreport: Clock,
                  };

                  const IconComponent = iconMap[tabId];
                  const path = linkMap[tabId];

                  if (IconComponent && path) {
                    return (
                      <Link
                        key={tabId}
                        to={path}
                        className={getChildLinkClass(path)}
                      >
                        <IconComponent className="w-4 h-4" />
                        <span>
                          {tabId === "reports_expirystock"
                            ? "Expiry Stock Report"
                            : tabId
                                .split("_")[1]
                                .replace(/([A-Z])/g, " $1")
                                .trim()}
                        </span>
                      </Link>
                    );
                  }

                  return null;
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
                <Settings className="w-5 h-5" />
              </span>
              <span>{isOpen && "Settings"}</span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    activeParentMenu === "utility" ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>
            {activeParentMenu === "utility" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs([
                  "utility_companyprofile",
                  "utility_tabhideview",
                ]).map((tabId) => {
                  if (tabId === "utility_companyprofile") {
                    return (
                      <Link
                        key={tabId}
                        to="/utilitylayout/companyprofile"
                        className={getChildLinkClass(
                          "/utilitylayout/companyprofile"
                        )}
                      >
                        <Building className="w-4 h-4" />
                        <span className="mx-auto">Company Profile</span>
                      </Link>
                    );
                  } else if (tabId === "utility_tabhideview") {
                    return (
                      <Link
                        key={tabId}
                        to="/utilitylayout/tabHideView"
                        className={getChildLinkClass(
                          "/utilitylayout/tabHideView"
                        )}
                      >
                        <Eye className="w-4 h-4" />
                        <span className="mx-auto">Tab Hide and Show</span>
                      </Link>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </div>
        )}

        {/* HRM - UPDATED: Changed from hrm_management to hrm_leaveattendance */}
        {shouldShowTab("hrm") && (
          <div>
            <button
              onClick={() => toggleMenu("hrm")}
              className={getDropdownButtonClass("hrm", hrmPaths)}
            >
              <span className="flex items-center gap-3">
                <UserCog className="w-5 h-5" />
              </span>
              <span>{isOpen && "HRM"}</span>
              {isOpen && (
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    activeParentMenu === "hrm" ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>
            {activeParentMenu === "hrm" && isOpen && (
              <div className="ml-6 mt-1 space-y-1">
                {getSortedTabs([
                  "hrm_dashboard",
                  "hrm_holidays",
                  "hrm_leaveattendance", // Changed from hrm_management
                  "hrm_payroll",
                ]).map((tabId) => {
                  const linkMap = {
                    hrm_dashboard: "/hrmlayout/dashboard",
                    hrm_holidays: "/hrmlayout/holidays",
                    hrm_leaveattendance: "/hrmlayout/leaveattendance", // Changed from /hrmlayout/management
                    hrm_payroll: "/hrmlayout/payroll",
                  };

                  const iconMap = {
                    hrm_dashboard: Home,
                    hrm_holidays: Umbrella,
                    hrm_leaveattendance: Calendar, // Combined icon
                    hrm_payroll: DollarSign,
                  };

                  const IconComponent = iconMap[tabId];
                  const path = linkMap[tabId];

                  return (
                    <Link
                      key={tabId}
                      to={path}
                      className={getChildLinkClass(path)}
                    >
                      <IconComponent className="w-4 h-4" />
                      <span className="mx-auto">
                        {tabId === "hrm_leaveattendance"
                          ? "Leave & Attendance" // Updated display name
                          : tabId.split("_")[1].charAt(0).toUpperCase() +
                            tabId.split("_")[1].slice(1)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}

export default Sidebar;
