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
} from "lucide-react";

function Sidebar({ isOpen, toggleSidebar, openSettingsSidebar }) {
  const location = useLocation();

  const [activeParentMenu, setActiveParentMenu] = useState(null);

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
    }else if (location.pathname.startsWith("/reportlayout")) {
      setActiveParentMenu("reports");
    }else if (location.pathname.startsWith("/reportlayout")) {
      setActiveParentMenu("reports");
    }else if (location.pathname.startsWith("/utilitylayout")) {
      setActiveParentMenu("utility");
    }else if (location.pathname.startsWith("/hrmlayout")) {
      setActiveParentMenu("hrm");
    }else if (location.pathname.startsWith("/settinglayout")) {
      setActiveParentMenu("hrm");
    }else{
      setActiveParentMenu(null);
    }
  }, [location.pathname]);

  const isActive = (path) => location.pathname === path;
  const isChildActive = (paths) =>
    paths.some((p) => location.pathname.startsWith(p));

  const toggleMenu = (menuKey) => {
    setActiveParentMenu((prev) => (prev === menuKey ? null : menuKey));
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
      <nav className="flex-1 overflow-y-hidden px-2 py-4 space-y-2">
        {/* Dashboard */}
        <Link to="/" className={getLinkClass("/")}>
          <Home className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Dashboard</span>}
        </Link>

        <div>
          <button
            onClick={() => toggleMenu("master", "/masterlayout/customer")}
            className={getDropdownButtonClass("master", [
              "/masterlayout/customer",
              "/masterlayout/supplier",
            ])}
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

        <div>
          <button
            onClick={() => toggleMenu("products")}
            className={getDropdownButtonClass("products")}
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
                to="/productmanagerlayout/brands"
                className={getChildLinkClass("/productmanagerlayout/brands")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Tags className="w-4 h-4" />
                <span className="mx-auto">Brands</span>
              </Link>

              <Link
                to="/productmanagerlayout/categories"
                className={getChildLinkClass(
                  "/productmanagerlayout/categories"
                )}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Layers className="w-4 h-4" />
                <span className="mx-auto">Categories</span>
              </Link>

              <Link
                to="/productmanagerlayout/product"
                className={getChildLinkClass("/productmanagerlayout/product")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Boxes className="w-4 h-4" />
                <span className="mx-auto">Products</span>
              </Link>

              <Link
                to="/productmanagerlayout/variation"
                className={getChildLinkClass("/productmanagerlayout/variation")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <ClipboardList className="w-4 h-4" />
                <span className="mx-auto">Variations</span>
              </Link>

              <Link
                to="/productmanagerlayout/printbarcode"
                className={getChildLinkClass(
                  "/productmanagerlayout/printbarcode"
                )}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Barcode className="w-4 h-4" />
                <span className="mx-auto">Print Barcode</span>
              </Link>
            </div>
          )}
        </div>

        <div>
          <button
            onClick={() => toggleMenu("purchase")}
            className={getDropdownButtonClass("purchase", [
              "/purchaselayout/purchase",
              "/purchaselayout/crnote",
              "/purchaselayout/purchaseout",
            ])}
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
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Package className="w-4 h-4" />
                <span className="mx-auto">Purchase</span>
              </Link>

              <Link
                to="/purchaselayout/crnote"
                className={getChildLinkClass("/purchaselayout/crnote")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <FileText className="w-4 h-4" />
                <span className="mx-auto">Purchase/Cr.Note</span>
              </Link>

              <Link
                to="/purchaselayout/purchaseout"
                className={getChildLinkClass("/purchaselayout/purchaseout")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Truck className="w-4 h-4" />
                <span className="mx-auto">Purchase Out</span>
              </Link>
            </div>
          )}
        </div>

        <div>
          <button
            onClick={() => toggleMenu("sales")}
            className={getDropdownButtonClass("sales", [
              "/salelayout/sale",
              "/salelayout/salereturn",
              "/salelayout/payment",
              "/salelayout/quotation",
            ])}
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
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <DollarSign className="w-4 h-4" />
                <span className="mx-auto">Sale</span>
              </Link>

              <Link
                to="/salelayout/salereturn"
                className={getChildLinkClass("/salelayout/salereturn")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <FileText className="w-4 h-4" />
                <span className="mx-auto">Sale Return/Cr.Note</span>
              </Link>

              <Link
                to="/salelayout/payment"
                className={getChildLinkClass("/salelayout/payment")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <CreditCard className="w-4 h-4" />
                <span className="mx-auto">Payment In</span>
              </Link>

              <Link
                to="/salelayout/quotation"
                className={getChildLinkClass("/salelayout/quotation")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <ClipboardList className="w-4 h-4" />
                <span className="mx-auto">Quotation</span>
              </Link>
            </div>
          )}
        </div>
        <Link
          to="/stockadjustment"
          className={getLinkClass("/stockadjustment")}
        >
          <ListChecks className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Stock Adjustment</span>}
        </Link>

        <Link to="/stocktransfer" className={getLinkClass("/stocktransfer")}>
          <Truck className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Stock Transfer</span>}
        </Link>

        <Link to="/cashandbank" className={getLinkClass("/cashandbank")}>
          <Wallet className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Cash & Bank</span>}
        </Link>

        <div>
          <button
            onClick={() => toggleMenu("expense")}
            className={getDropdownButtonClass("expense", [
              "/expenselayout/expensecategories",
              "/expenselayout/expenses",
            ])}
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
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Layers className="w-4 h-4" />
                <span className="mx-auto">Expense Categories</span>
              </Link>
              <Link
                to="/expenselayout/expenses"
                className={getChildLinkClass("/expenselayout/expenses")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <DollarSign className="w-4 h-4" />
                <span className="mx-auto">Expenses</span>
              </Link>
            </div>
          )}
        </div>
        <div>
          <button
            onClick={() => toggleMenu("reports")}
            className={getDropdownButtonClass("reports", [
              "/reportlayout/payment",
              "/reportlayout/salesummary",
              "/reportlayout/stocksummary",
              "/reportlayout/productsalessummary",
              "/reportlayout/stockalert",
              "/reportlayout/expensereport",
              "/reportlayout/userreport",
              "/reportlayout/ratelist",
              "/reportlayout/profitloss",
            ])}
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
                to="/reportlayout/payment"
                className={getChildLinkClass("/reportlayout/payment")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <CreditCard className="w-4 h-4" />
                <span className="mx-auto">Payments</span>
              </Link>
              <Link
                to="/reportlayout/salesummary"
                className={getChildLinkClass("/reportlayout/salesummary")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <TrendingUp className="w-4 h-4" />
                <span className="mx-auto">Sale Summary</span>
              </Link>
              <Link
                to="/reportlayout/stocksummary"
                className={getChildLinkClass("/reportlayout/stocksummary")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Boxes className="w-4 h-4" />
                <span className="mx-auto">Stock Summary</span>
              </Link>
              <Link
                to="/reportlayout/productsalessummary"
                className={getChildLinkClass(
                  "/reportlayout/productsalessummary"
                )}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Package className="w-4 h-4" />
                <span className="mx-auto">Product Sales</span>
              </Link>
              <Link
                to="/reportlayout/stockalert"
                className={getChildLinkClass("/reportlayout/stockalert")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="mx-auto">Stock Alert</span>
              </Link>
              <Link
                to="/reportlayout/expensereport"
                className={getChildLinkClass("/reportlayout/expensereport")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <FileBarChart className="w-4 h-4" />
                <span className="mx-auto">Expenses Report</span>
              </Link>
              <Link
                to="/reportlayout/userreport"
                className={getChildLinkClass("/reportlayout/userreport")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <UsersRound className="w-4 h-4" />
                <span className="mx-auto">User Report</span>
              </Link>
              <Link
                to="/reportlayout/ratelist"
                className={getChildLinkClass("/reportlayout/ratelist")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <ListChecks className="w-4 h-4" />
                <span className="mx-auto">Rate List</span>
              </Link>
              <Link
                to="/reportlayout/profitloss"
                className={getChildLinkClass("/reportlayout/profitloss")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <DollarSign className="w-4 h-4" />
                <span className="mx-auto">Profit & Loss</span>
              </Link>
            </div>
          )}
        </div>

        <Link to="/staffmember" className={getLinkClass("/staffmember")}>
          <UserCog className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Staff Members</span>}
        </Link>

        <div>
          <button
            onClick={() => toggleMenu("utility")}
            className={getDropdownButtonClass("utility", [
              "/utilitylayout/productcard",
              "/utilitylayout/frontsettings",
            ])}
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
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Package className="w-4 h-4" />
                <span className="mx-auto">Product Card</span>
              </Link>
              <Link
                to="/utilitylayout/frontsettings"
                className={getChildLinkClass("/utilitylayout/frontsettings")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Settings className="w-4 h-4" />
                <span className="mx-auto">Front Settings</span>
              </Link>
            </div>
          )}
        </div>

        <Link to="/onlineorder" className={getLinkClass("/onlineorder")}>
          <ShoppingCart className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Online Orders</span>}
        </Link>

        <div>
          <button
            onClick={() => toggleMenu("hrm")}
            className={getDropdownButtonClass("hrm", [
              "/hrmlayout/dashboard",
              "/hrmlayout/holidays",
              "/hrmlayout/leaves",
              "/hrmlayout/attendance",
              "/hrmlayout/payroll",
              "/hrmlayout/hrmsetting",
            ])}
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
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Home className="w-4 h-4" />
                <span className="mx-auto">Dashboard</span>
              </Link>
              <Link
                to="/hrmlayout/holidays"
                className={getChildLinkClass("/hrmlayout/holidays")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Umbrella className="w-4 h-4" />
                <span className="mx-auto">Holidays</span>
              </Link>
              <Link
                to="/hrmlayout/leaves"
                className={getChildLinkClass("/hrmlayout/leaves")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Calendar className="w-4 h-4" />
                <span className="mx-auto">Leaves</span>
              </Link>
              <Link
                to="/hrmlayout/attendance"
                className={getChildLinkClass("/hrmlayout/attendance")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Calendar className="w-4 h-4" />
                <span className="mx-auto">Attendance</span>
              </Link>
              <Link
                to="/hrmlayout/payroll"
                className={getChildLinkClass("/hrmlayout/payroll")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <DollarSign className="w-4 h-4" />
                <span className="mx-auto">Payroll</span>
              </Link>
              <Link
                to="/hrmlayout/hrmsetting"
                className={getChildLinkClass("/hrmlayout/hrmsetting")}
                onClick={() => setActiveParentMenu(activeParentMenu)}
              >
                <Settings className="w-4 h-4" />
                <span className="mx-auto">HRM Settings</span>
              </Link>
            </div>
          )}
        </div>

        <button
          onClick={openSettingsSidebar}
          className="flex items-center gap-15 w-full  rounded-md hover:bg-gray-700"
        >
          <Settings className="w-5 h-5" />
          {isOpen && "Settings"}
        </button>
      </nav>
    </div>
  );
}

export default Sidebar;
