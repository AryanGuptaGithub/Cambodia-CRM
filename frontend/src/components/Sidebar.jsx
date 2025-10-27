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
} from "lucide-react";

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
  "/hrmlayout/leaves",
  "/hrmlayout/attendance",
  "/hrmlayout/payroll",
  "/hrmlayout/hrmsetting",
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

// Define utility paths - updated to settings paths
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

  // Add visibleTabs state with default values
  const [visibleTabs, setVisibleTabs] = useState({
    dashboard: true,
    master: true,
    settings: true,
    products: true,
    purchase: true,
    sales: true,
    stockAdjustment: true,
    stockTransfer: true,
    accounts: true,
    expense: true,
    reports: true,
    staff: true,
    utility: true,
    onlineOrders: true,
    hrm: true,
  });

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
      // Check if current path is under master customer reports
      if (
        masterCustomerReportPaths.some((path) =>
          location.pathname.startsWith(path)
        )
      ) {
        setActiveSubMenu("masterCustomerReports");
      }
      // Check if current path is under finance reports
      if (
        financeReportPaths.some((path) => location.pathname.startsWith(path))
      ) {
        setActiveFinanceSubMenu("financeReports");
      }
      // Check if current path is under reports in hand
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
    } else {
      setActiveParentMenu(null);
    }
  }, [location.pathname]);

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

  const handleTabVisibilityChange = (tabId) => {
    setVisibleTabs((prev) => ({
      ...prev,
      [tabId]: !prev[tabId],
    }));
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

  // Filter navigation items based on visible tabs
  const shouldShowTab = (tabId) => visibleTabs[tabId];

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
        {/* Dashboard - Conditionally rendered */}
        {shouldShowTab("dashboard") && (
          <Link to="/" className={getLinkClass("/")}>
            <Home className="w-5 h-5" />
            {isOpen && <span className="mx-auto">Dashboard</span>}
          </Link>
        )}

        {/* Master - Conditionally rendered */}
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
                <Link
                  to="/masterlayout/customer"
                  className={getChildLinkClass("/masterlayout/customer")}
                >
                  <Users className="w-4 h-4" />
                  <span className="mx-auto">Customers</span>
                </Link>
                <Link
                  to="/masterlayout/supplier"
                  className={getChildLinkClass("/masterlayout/supplier")}
                >
                  <Truck className="w-4 h-4" />
                  <span className="mx-auto">Suppliers</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Settings - Conditionally rendered */}
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
                <Link
                  to="/settingslayout/company-profile"
                  className={getChildLinkClass(
                    "/settingslayout/company-profile"
                  )}
                >
                  <Building className="w-4 h-4" />
                  <span className="mx-auto">Company Profile</span>
                </Link>
                <Link
                  to="/settingslayout/tab-manipulation"
                  className={getChildLinkClass(
                    "/settingslayout/tab-manipulation"
                  )}
                >
                  <Eye className="w-4 h-4" />
                  <span className="mx-auto">Tab Manipulation</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Product Manager - Conditionally rendered */}
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
                <Link
                  to="/productmanagerlayout/product"
                  className={getChildLinkClass("/productmanagerlayout/product")}
                >
                  <Boxes className="w-4 h-4" />
                  <span className="mx-auto">Products</span>
                </Link>

                <Link
                  to="/productmanagerlayout/pricelist"
                  className={getChildLinkClass(
                    "/productmanagerlayout/pricelist"
                  )}
                >
                  <ClipboardList className="w-4 h-4" />
                  <span className="mx-auto">Price List</span>
                </Link>

                <Link
                  to="/productmanagerlayout/printbarcode"
                  className={getChildLinkClass(
                    "/productmanagerlayout/printbarcode"
                  )}
                >
                  <Barcode className="w-4 h-4" />
                  <span className="mx-auto">Print Barcode</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Purchase - Conditionally rendered */}
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
                <Link
                  to="/purchaselayout/purchase"
                  className={getChildLinkClass("/purchaselayout/purchase")}
                >
                  <Package className="w-4 h-4" />
                  <span className="mx-auto">Purchase</span>
                </Link>
                <Link
                  to="/purchaselayout/purchasereturn"
                  className={getChildLinkClass(
                    "/purchaselayout/purchasereturn"
                  )}
                >
                  <FileText className="w-4 h-4" />
                  <span className="mx-auto">Purchase/Cr.Note</span>
                </Link>

                <Link
                  to="/purchaselayout/purchaseout"
                  className={getChildLinkClass("/purchaselayout/purchaseout")}
                >
                  <Truck className="w-4 h-4" />
                  <span className="mx-auto">Purchase Out</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Sales - Conditionally rendered */}
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
                <Link
                  to="/salelayout/sale"
                  className={getChildLinkClass("/salelayout/sale")}
                >
                  <DollarSign className="w-4 h-4" />
                  <span className="mx-auto">Sale</span>
                </Link>

                <Link
                  to="/salelayout/salereturn"
                  className={getChildLinkClass("/salelayout/salereturn")}
                >
                  <FileText className="w-4 h-4" />
                  <span className="mx-auto">Sale Return/Cr.Note</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Stock Adjustment - Conditionally rendered */}
        {shouldShowTab("stockAdjustment") && (
          <Link
            to="/stockadjustment"
            className={getLinkClass("/stockadjustment")}
          >
            <ListChecks className="w-5 h-5" />
            {isOpen && <span className="mx-auto">Stock Adjustment</span>}
          </Link>
        )}

        {/* Stock Transfer - Conditionally rendered */}
        {shouldShowTab("stockTransfer") && (
          <Link to="/stocktransfer" className={getLinkClass("/stocktransfer")}>
            <Truck className="w-5 h-5" />
            {isOpen && <span className="mx-auto">Stock Transfer</span>}
          </Link>
        )}

        {/* Accounts - Conditionally rendered */}
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

        {/* Expense - Conditionally rendered */}
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
                <Link
                  to="/expenselayout/expensecategories"
                  className={getChildLinkClass(
                    "/expenselayout/expensecategories"
                  )}
                >
                  <Layers className="w-4 h-4" />
                  <span className="mx-auto">Expense Categories</span>
                </Link>
                <Link
                  to="/expenselayout/expenses"
                  className={getChildLinkClass("/expenselayout/expenses")}
                >
                  <DollarSign className="w-4 h-4" />
                  <span className="mx-auto">Expenses</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Reports - Conditionally rendered */}
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
                {/* Reports content remains the same */}
                <Link
                  to="/reportlayout/dailyreport"
                  className={getChildLinkClass("/reportlayout/dailyreport")}
                >
                  <CreditCard className="w-4 h-4" />
                  <span className="mx-auto">Daily Reports</span>
                </Link>

                <Link
                  to="/reportlayout/averageprice"
                  className={getChildLinkClass("/reportlayout/averageprice")}
                >
                  <Calculator className="w-4 h-4" />
                  <span className="mx-auto">Average Price Per Product</span>
                </Link>

                <Link
                  to="/reportlayout/newcustomeraddition"
                  className={getChildLinkClass(
                    "/reportlayout/newcustomeraddition"
                  )}
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="mx-auto">New Customer Addition</span>
                </Link>

                {/* Master Customer Report with Dropdown */}
                <div>
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
                      <Link
                        to="/reportlayout/customerretention"
                        className={getChildLinkClass(
                          "/reportlayout/customerretention"
                        )}
                      >
                        <Repeat className="w-4 h-4" />
                        <span>Customer Retention Rate</span>
                      </Link>
                      <Link
                        to="/reportlayout/customeracceptance"
                        className={getChildLinkClass(
                          "/reportlayout/customeracceptance"
                        )}
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Product Acceptance Rate</span>
                      </Link>
                      <Link
                        to="/reportlayout/zonewisecustomers"
                        className={getChildLinkClass(
                          "/reportlayout/zonewisecustomers"
                        )}
                      >
                        <MapPin className="w-4 h-4" />
                        <span>Zone Wise Customers</span>
                      </Link>
                    </div>
                  )}
                </div>
                <Link
                  to="/reportlayout/monthlyrepeatrate"
                  className={getChildLinkClass(
                    "/reportlayout/monthlyrepeatrate"
                  )}
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>Monthly Customer Repeat Rate</span>
                </Link>
                <Link
                  to="/reportlayout/annualrepeatrate"
                  className={getChildLinkClass(
                    "/reportlayout/annualrepeatrate"
                  )}
                >
                  <CalendarRange className="w-4 h-4" />
                  <span>Annual Customer Repeat Rate</span>
                </Link>

                <Link
                  to="/reportlayout/product-report"
                  className={getChildLinkClass("/reportlayout/product-report")}
                >
                  <PackageSearch className="w-4 h-4" />
                  <span className="mx-auto">Product Reports</span>
                </Link>

                <Link
                  to="/reportlayout/mrwiseoutstanding"
                  className={getChildLinkClass(
                    "/reportlayout/mrwiseoutstanding"
                  )}
                >
                  <UserSearch className="w-4 h-4" />
                  <span className="mx-auto">MR Wise Outstanding</span>
                </Link>
                <Link
                  to="/reportlayout/mrwisesales"
                  className={getChildLinkClass("/reportlayout/mrwisesales")}
                >
                  <Target className="w-4 h-4" />
                  <span className="mx-auto">MR Wise Sales</span>
                </Link>
                <Link
                  to="/reportlayout/cashsales"
                  className={getChildLinkClass("/reportlayout/cashsales")}
                >
                  <DollarSign className="w-4 h-4" />
                  <span className="mx-auto">Total Cash Sales</span>
                </Link>
                <Link
                  to="/reportlayout/outstandingcollection"
                  className={getChildLinkClass(
                    "/reportlayout/outstandingcollection"
                  )}
                >
                  <Receipt className="w-4 h-4" />
                  <span className="mx-auto">Outstanding Collection</span>
                </Link>
                <Link
                  to="/reportlayout/totalexpense"
                  className={getChildLinkClass("/reportlayout/totalexpense")}
                >
                  <PieChart className="w-4 h-4" />
                  <span className="mx-auto">Total Expense</span>
                </Link>
                <Link
                  to="/reportlayout/remittance"
                  className={getChildLinkClass("/reportlayout/remittance")}
                >
                  <Coins className="w-4 h-4" />
                  <span className="mx-auto">Remittance</span>
                </Link>

                <Link
                  to="/reportlayout/province-wise-sale"
                  className={getChildLinkClass(
                    "/reportlayout/province-wise-sale"
                  )}
                >
                  <Globe className="w-4 h-4" />
                  <span className="mx-auto">Province Wise Sale</span>
                </Link>
                <Link
                  to="/reportlayout/province-wise-customer"
                  className={getChildLinkClass(
                    "/reportlayout/province-wise-customer"
                  )}
                >
                  <Users className="w-4 h-4" />
                  <span className="mx-auto">Province Wise Customer</span>
                </Link>

                <Link
                  to="/reportlayout/payment"
                  className={getChildLinkClass("/reportlayout/payment")}
                >
                  <CreditCard className="w-4 h-4" />
                  <span className="mx-auto">Payments</span>
                </Link>

                {/* Finance Reports Section */}
                <div>
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
                      <Link
                        to="/reportlayout/sales-salary-ratio"
                        className={getChildLinkClass(
                          "/reportlayout/sales-salary-ratio"
                        )}
                      >
                        <Percent className="w-4 h-4" />
                        <span>Sales / Salary Ratio</span>
                      </Link>
                      <Link
                        to="/reportlayout/salary-cogs-ratio"
                        className={getChildLinkClass(
                          "/reportlayout/salary-cogs-ratio"
                        )}
                      >
                        <Scale className="w-4 h-4" />
                        <span>Salary / COGS Ratio</span>
                      </Link>
                      <Link
                        to="/reportlayout/operation-cost-cogs-ratio"
                        className={getChildLinkClass(
                          "/reportlayout/operation-cost-cogs-ratio"
                        )}
                      >
                        <TrendingDown className="w-4 h-4" />
                        <span>Operation Cost / COGS</span>
                      </Link>
                      <Link
                        to="/reportlayout/operation-cost-sales-ratio"
                        className={getChildLinkClass(
                          "/reportlayout/operation-cost-sales-ratio"
                        )}
                      >
                        <BarChart3 className="w-4 h-4" />
                        <span>Operation Cost / Sales</span>
                      </Link>
                      <Link
                        to="/reportlayout/tour-expense-sales-ratio"
                        className={getChildLinkClass(
                          "/reportlayout/tour-expense-sales-ratio"
                        )}
                      >
                        <MapPin className="w-4 h-4" />
                        <span>Tour Expense / Sales</span>
                      </Link>
                      <Link
                        to="/reportlayout/pl-report"
                        className={getChildLinkClass("/reportlayout/pl-report")}
                      >
                        <FileBarChart className="w-4 h-4" />
                        <span>P&L Report</span>
                      </Link>
                    </div>
                  )}
                </div>

                <Link
                  to="/reportlayout/reports-in-hand"
                  className={getChildLinkClass("/reportlayout/reports-in-hand")}
                >
                  <HandCoins className="w-4 h-4" />
                  <span>Reports in Hand</span>
                </Link>

                <Link
                  to="/reportlayout/salesummary"
                  className={getChildLinkClass("/reportlayout/salesummary")}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span className="mx-auto">Sale Summary</span>
                </Link>
                <Link
                  to="/reportlayout/dailysample"
                  className={getChildLinkClass("/reportlayout/dailysample")}
                >
                  <Boxes className="w-4 h-4" />
                  <span className="mx-auto">Daily Sample</span>
                </Link>
                <Link
                  to="/reportlayout/profitloss"
                  className={getChildLinkClass("/reportlayout/profitloss")}
                >
                  <DollarSign className="w-4 h-4" />
                  <span className="mx-auto">Profit & Loss</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Staff Members - Conditionally rendered */}
        {shouldShowTab("staff") && (
          <Link
            to="/staffmemberLayout/staffmember"
            className={getLinkClass("/staffmemberLayout")}
          >
            <UserCog className="w-5 h-5" />
            {isOpen && <span className="mx-auto">Staff Members</span>}
          </Link>
        )}

        {/* Utility - Changed to Settings */}
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
                <Link
                  to="/utilitylayout/companyprofile"
                  className={getChildLinkClass("/utilitylayout/companyprofile")}
                >
                  <Building className="w-4 h-4" />
                  <span className="mx-auto">Company Profile</span>
                </Link>
                <Link
                  to="/utilitylayout/tabHideView"
                  className={getChildLinkClass("/utilitylayout/tabHideView")}
                >
                  <Eye className="w-4 h-4" />
                  <span className="mx-auto">Tab Hide and Show</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* HRM - Conditionally rendered */}
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
                <Link
                  to="/hrmlayout/dashboard"
                  className={getChildLinkClass("/hrmlayout/dashboard")}
                >
                  <Home className="w-4 h-4" />
                  <span className="mx-auto">Dashboard</span>
                </Link>
                <Link
                  to="/hrmlayout/holidays"
                  className={getChildLinkClass("/hrmlayout/holidays")}
                >
                  <Umbrella className="w-4 h-4" />
                  <span className="mx-auto">Holidays</span>
                </Link>
                <Link
                  to="/hrmlayout/leaves"
                  className={getChildLinkClass("/hrmlayout/leaves")}
                >
                  <Calendar className="w-4 h-4" />
                  <span className="mx-auto">Leaves</span>
                </Link>
                <Link
                  to="/hrmlayout/attendance"
                  className={getChildLinkClass("/hrmlayout/attendance")}
                >
                  <Calendar className="w-4 h-4" />
                  <span className="mx-auto">Attendance</span>
                </Link>
                <Link
                  to="/hrmlayout/payroll"
                  className={getChildLinkClass("/hrmlayout/payroll")}
                >
                  <DollarSign className="w-4 h-4" />
                  <span className="mx-auto">Payroll</span>
                </Link>
                <Link
                  to="/hrmlayout/hrmsetting"
                  className={getChildLinkClass("/hrmlayout/hrmsetting")}
                >
                  <Settings className="w-4 h-4" />
                  <span className="mx-auto">HRM Settings</span>
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}

export default Sidebar;