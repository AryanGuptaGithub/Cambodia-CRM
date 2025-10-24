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
  Building2,
  Tags,
  Layers,
  Boxes,
  Barcode,
  CreditCard,
  TrendingUp,
  FileBarChart,
  Wallet,
  UserCog,
  Truck,
  ClipboardList,
  DollarSign,
  Briefcase,
  BarChart3,
  AlertTriangle,
  ListChecks,
  Calendar,
  Umbrella,
  UserCheck,
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
];

const utilityPaths = [
  "/utilitylayout/productcard",
  "/utilitylayout/frontsettings",
];

const accountPaths = ["/accountlayout"];

// Master Customer Report paths
const masterCustomerReportPaths = [
  "/reportlayout/customerretention",
  "/reportlayout/customeracceptance",
  "/reportlayout/zonewisecustomers",
  "/reportlayout/monthlyrepeatrate",
  "/reportlayout/annualrepeatrate",
];

function Sidebar({ isOpen, toggleSidebar, openSettingsSidebar }) {
  const location = useLocation();

  const [activeParentMenu, setActiveParentMenu] = useState(null);
  const [activeSubMenu, setActiveSubMenu] = useState(null);

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
    } else if (location.pathname.startsWith("/utilitylayout")) {
      setActiveParentMenu("utility");
    } else if (location.pathname.startsWith("/hrmlayout")) {
      setActiveParentMenu("hrm");
    } else if (location.pathname.startsWith("/accountlayout")) {
      setActiveParentMenu("accounts");
    } else if (location.pathname.startsWith("/settinglayout")) {
      setActiveParentMenu("hrm");
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

  return (
    <div
      className={`bg-gray-900 text-white transition-all duration-300 ${
        isOpen ? "w-64" : "w-16"
      } flex flex-col`}
    >
      {/* Logo */}
      <div className="flex items-center justify-center py-4 text-lg font-bold border-b border-gray-700">
        {isOpen ? "CRM" : "C"}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-2">
        {/* Dashboard */}
        <Link to="/" className={getLinkClass("/")}>
          <Home className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Dashboard</span>}
        </Link>

        {/* Master */}
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

        {/* Product Manager */}
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
                className={getChildLinkClass("/productmanagerlayout/pricelist")}
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

        {/* Purchase */}
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
                className={getChildLinkClass("/purchaselayout/purchasereturn")}
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

        {/* Sales */}
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

        {/* Stock Adjustment */}
        <Link
          to="/stockadjustment"
          className={getLinkClass("/stockadjustment")}
        >
          <ListChecks className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Stock Adjustment</span>}
        </Link>

        {/* Stock Transfer */}
        <Link to="/stocktransfer" className={getLinkClass("/stocktransfer")}>
          <Truck className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Stock Transfer</span>}
        </Link>
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

        {/* Reports */}
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
              <Link
                to="/reportlayout/dailyreport"
                className={getChildLinkClass("/reportlayout/dailyreport")}
              >
                <CreditCard className="w-4 h-4" />
                <span className="mx-auto">Daily Reports</span>
              </Link>

              {/* New Report: Average Price Per Product */}
              <Link
                to="/reportlayout/averageprice"
                className={getChildLinkClass("/reportlayout/averageprice")}
              >
                <Calculator className="w-4 h-4" />
                <span className="mx-auto">Average Price Per Product</span>
              </Link>

              {/* New Report: New Customer Addition */}
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
                className={getChildLinkClass("/reportlayout/monthlyrepeatrate")}
              >
                <CalendarDays className="w-4 h-4" />
                <span>Monthly Customer Repeat Rate</span>
              </Link>
              {/* New Annual Customer Repeat Rate */}
              <Link
                to="/reportlayout/annualrepeatrate"
                className={getChildLinkClass("/reportlayout/annualrepeatrate")}
              >
                <CalendarRange className="w-4 h-4" />
                <span>Annual Customer Repeat Rate</span>
              </Link>
              <Link
                to="/reportlayout/payment"
                className={getChildLinkClass("/reportlayout/payment")}
              >
                <CreditCard className="w-4 h-4" />
                <span className="mx-auto">Payments</span>
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
                to="/reportlayout/productsalessummary"
                className={getChildLinkClass(
                  "/reportlayout/productsalessummary"
                )}
              >
                <Package className="w-4 h-4" />
                <span className="mx-auto">Product Sales</span>
              </Link>
              <Link
                to="/reportlayout/stockalert"
                className={getChildLinkClass("/reportlayout/stockalert")}
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="mx-auto">Stock Alert</span>
              </Link>
              <Link
                to="/reportlayout/expensereport"
                className={getChildLinkClass("/reportlayout/expensereport")}
              >
                <FileBarChart className="w-4 h-4" />
                <span className="mx-auto">Expenses Report</span>
              </Link>
              <Link
                to="/reportlayout/userreport"
                className={getChildLinkClass("/reportlayout/userreport")}
              >
                <UsersRound className="w-4 h-4" />
                <span className="mx-auto">User Report</span>
              </Link>
              <Link
                to="/reportlayout/ratelist"
                className={getChildLinkClass("/reportlayout/ratelist")}
              >
                <ListChecks className="w-4 h-4" />
                <span className="mx-auto">Rate List</span>
              </Link>
              <Link
                to="/reportlayout/profitloss"
                className={getChildLinkClass("/reportlayout/profitloss")}
              >
                <DollarSign className="w-4 h-4" />
                <span className="mx-auto">Profit & Loss</span>
              </Link>
              <Link
                to="/reportlayout/mrwiseoutstanding"
                className={getChildLinkClass("/reportlayout/mrwiseoutstanding")}
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
              {/* New Report Links */}
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
            </div>
          )}
        </div>

        {/* Staff Members */}
        <Link
          to="/staffmemberLayout/staffmember"
          className={getLinkClass("/staffmemberLayout")}
        >
          <UserCog className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Staff Members</span>}
        </Link>

        {/* Utility */}
        <div>
          <button
            onClick={() => toggleMenu("utility")}
            className={getDropdownButtonClass("utility", utilityPaths)}
          >
            <span className="flex items-center gap-3">
              <Briefcase className="w-5 h-5" />
            </span>
            <span>{isOpen && "Utility"}</span>
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
                to="/utilitylayout/productcard"
                className={getChildLinkClass("/utilitylayout/productcard")}
              >
                <Package className="w-4 h-4" />
                <span className="mx-auto">Product Card</span>
              </Link>
              <Link
                to="/utilitylayout/frontsettings"
                className={getChildLinkClass("/utilitylayout/frontsettings")}
              >
                <Settings className="w-4 h-4" />
                <span className="mx-auto">Front Settings</span>
              </Link>
            </div>
          )}
        </div>

        {/* Online Orders */}
        <Link to="/onlineorder" className={getLinkClass("/onlineorder")}>
          <ShoppingCart className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Online Orders</span>}
        </Link>

        {/* HRM */}
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

        {/* Settings */}
        <button
          onClick={openSettingsSidebar}
          className="flex items-center gap-15 w-full p-2 rounded-md hover:bg-gray-700 text-gray-200"
        >
          <Settings className="w-5 h-5" />
          {isOpen && "Settings"}
        </button>
      </nav>
    </div>
  );
}

export default Sidebar;
