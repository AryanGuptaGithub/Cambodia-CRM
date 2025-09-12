import React, { useState } from "react";
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

const masterPaths = [
  "/masterlayout/customer",
  "/masterlayout/supplier",
];
const purchasePaths = [
  "/purchaselayout/purchase",
  "/purchaselayout/crnote",
  "/purchaselayout/purchaseout",
];

const productPaths = [
  "/productmanagerlayout/brands",
  "/productmanagerlayout/categories",
  "/productmanagerlayout/product",
  "/productmanagerlayout/variation",
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
  "/reportlayout/salesummary",
  "/reportlayout/stocksummary",
  "/reportlayout/productsalessummary",
  "/reportlayout/stockalert",
  "/reportlayout/expensereport",
  "/reportlayout/userreport",
  "/reportlayout/ratelist",
  "/reportlayout/profitloss",
];

const utilityPaths = [
  "/utilitylayout/productcard",
  "/utilitylayout/frontsettings",
];

function Sidebar({ isOpen, toggleSidebar, openSettingsSidebar }) {
  const location = useLocation();
  const isActivePath = (path) => location.pathname === path;
const isDropdownActive = (paths) => paths.some((path) => location.pathname.startsWith(path));

  const [openMenus, setOpenMenus] = useState({});

  const toggleMenu = (menu) => {
    setOpenMenus((prev) => ({ ...prev, [menu]: !prev[menu] }));
  };

  return (
    <div
      className={`bg-gray-900 text-white text-center transition-all duration-300 ${
        isOpen ? "w-64" : "w-16"
      } flex flex-col`}
    >
      {/* Logo */}
      <div className="flex items-center justify-center py-4 text-lg font-bold border-b border-gray-700">
        {isOpen ? "CRM" : "C"}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-2">
        {/* Dashboard */}
    <Link
  to="/"
  className={`flex items-center gap-3 p-2 rounded-md transition shadow-sm hover:bg-gray-700 ${
    isActivePath("/") ? "bg-gray-700 shadow-lg" : ""
  }`}
>
  <Home className="w-5 h-5" />
  {isOpen && <span className="">Dashboard</span>}
</Link>

        {/* Master Dropdown */}
        <div>
        <button
  className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700 ${
   openMenus.master ? "bg-gray-700 shadow-md" : ""
  }`}
  onClick={() => toggleMenu("master")}
>
  <span className="flex items-center gap-3">
    <Users className="w-5 h-5" />
    {isOpen && "Master"}
  </span>
  {isOpen && (
    <ChevronDown
      className={`w-4 h-4 transform transition-transform ${
    openMenus.master ? "rotate-180" : ""
      }`}
    />
  )}
</button>
        {openMenus.master && isOpen && (
  <div className="ml-6 mt-1 space-y-1">
    <Link
      to="/masterlayout/customer"
      className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
        isActivePath("/masterlayout/customer") ? "bg-gray-700 shadow-md" : ""
      }`}
    >
      <Users className="w-4 h-4" />
      <span className="mx-auto">Customers</span>
    </Link>
    <Link
      to="/masterlayout/supplier"
      className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
        isActivePath("/masterlayout/supplier") ? "bg-gray-700 shadow-md" : ""
      }`}
    >
      <Truck className="w-4 h-4" />
      <span className="mx-auto">Suppliers</span>
    </Link>
  </div>
)}
        </div>

        {/* Products Dropdown */}
<div>
  <button
    className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700 ${
      openMenus.products ? "bg-gray-700 shadow-md" : ""
    }`}
    onClick={() => toggleMenu("products")}
  >
    <span className="flex items-center gap-3">
      <Package className="w-5 h-5" />
      {isOpen && "Product Manager"}
    </span>
    {isOpen && (
      <ChevronDown
        className={`w-4 h-4 transform transition-transform ${
          openMenus.products ? "rotate-180" : ""
        }`}
      />
    )}
  </button>

  {openMenus.products && isOpen && (
    <div className="ml-6 mt-1 space-y-1">
      <Link
        to="/productmanagerlayout/brands"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/productmanagerlayout/brands") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Tags className="w-4 h-4" />
        <span className="mx-auto">Brands</span>
      </Link>
      <Link
        to="/productmanagerlayout/categories"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/productmanagerlayout/categories") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Layers className="w-4 h-4" />
        <span className="mx-auto">Categories</span>
      </Link>
      <Link
        to="/productmanagerlayout/product"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/productmanagerlayout/product") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Boxes className="w-4 h-4" />
        <span className="mx-auto">Products</span>
      </Link>
      <Link
        to="/productmanagerlayout/variation"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/productmanagerlayout/variation") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <ClipboardList className="w-4 h-4" />
        <span className="mx-auto">Variations</span>
      </Link>
      <Link
        to="/productmanagerlayout/printbarcode"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/productmanagerlayout/printbarcode") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Barcode className="w-4 h-4" />
        <span className="mx-auto">Print Barcode</span>
      </Link>
    </div>
  )}
</div>


        {/* Purchases */}
     <div>
  <button
    className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700 ${
      openMenus.purchase ? "bg-gray-700 shadow-md" : ""
    }`}
    onClick={() => toggleMenu("purchase")}
  >
    <span className="flex items-center gap-3">
      <ShoppingCart className="w-5 h-5" />
      {isOpen && "Purchase"}
    </span>
    {isOpen && (
      <ChevronDown
        className={`w-4 h-4 transform transition-transform ${
          openMenus.purchase ? "rotate-180" : ""
        }`}
      />
    )}
  </button>

  {openMenus.purchase && isOpen && (
    <div className="ml-6 mt-1 space-y-1">
      <Link
        to="/purchaselayout/purchase"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/purchaselayout/purchase") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Package className="w-4 h-4" />
        <span className="mx-auto">Purchase</span>
      </Link>
      <Link
        to="/purchaselayout/crnote"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/purchaselayout/crnote") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <FileText className="w-4 h-4" />
        <span className="mx-auto">Purchase/Cr.Note</span>
      </Link>
      <Link
        to="/purchaselayout/purchaseout"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/purchaselayout/purchaseout") ? "bg-gray-700 shadow-md" : ""
        }`}
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
    className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700 ${
      openMenus.sales ? "bg-gray-700 shadow-md" : ""
    }`}
    onClick={() => toggleMenu("sales")}
  >
    <span className="flex items-center gap-3">
      <TrendingUp className="w-5 h-5" />
      {isOpen && "Sales"}
    </span>
    {isOpen && (
      <ChevronDown
        className={`w-4 h-4 transform transition-transform ${
          openMenus.sales ? "rotate-180" : ""
        }`}
      />
    )}
  </button>

  {openMenus.sales && isOpen && (
    <div className="ml-6 mt-1 space-y-1">
      <Link
        to="/salelayout/sale"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/salelayout/sale") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <DollarSign className="w-4 h-4" />
        <span className="mx-auto">Sale</span>
      </Link>
      <Link
        to="/salelayout/salereturn"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/salelayout/salereturn") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <FileText className="w-4 h-4" />
        <span className="mx-auto">Sale Return/Cr.Note</span>
      </Link>
      <Link
        to="/salelayout/payment"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/salelayout/payment") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <CreditCard className="w-4 h-4" />
        <span className="mx-auto">Payment In</span>
      </Link>
      <Link
        to="/salelayout/quotation"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/salelayout/quotation") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <ClipboardList className="w-4 h-4" />
        <span className="mx-auto">Quotation</span>
      </Link>
    </div>
  )}
</div>


        {/* Example: single links with icons */}
        <Link to="/stockadjustment" className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded">
          <ListChecks className="w-4 h-4" />
          {isOpen && <span className="">Stock Adjustment</span>}
        </Link>

        <Link to="/stocktransfer" className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded">
          <Truck className="w-4 h-4" />
          {isOpen && <span className="">Stock Transfer</span>}
        </Link>

        <Link to="/cashandbank" className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded">
          <Wallet className="w-4 h-4" />
          {isOpen && <span className="">Cash & Bank</span>}
        </Link>

        {/* Expenses Dropdown */}
      <div>
  <button
    className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700 ${
      openMenus.expense || isDropdownActive(expensePaths) ? "bg-gray-700 shadow-md" : ""
    }`}
    onClick={() => toggleMenu("expense")}
  >
    <span className="flex items-center gap-3">
      <FileText className="w-5 h-5" />
      {isOpen && "Expense"}
    </span>
    {isOpen && (
      <ChevronDown
        className={`w-4 h-4 transform transition-transform ${
          openMenus.expense || isDropdownActive(expensePaths) ? "rotate-180" : ""
        }`}
      />
    )}
  </button>

  {(openMenus.expense || isDropdownActive(expensePaths)) && isOpen && (
    <div className="ml-6 mt-1 space-y-1">
      <Link
        to="/expenselayout/expensecategories"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/expenselayout/expensecategories") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Layers className="w-4 h-4" />
        <span className="mx-auto">Expense Categories</span>
      </Link>
      <Link
        to="/expenselayout/expenses"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/expenselayout/expenses") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <DollarSign className="w-4 h-4" />
        <span className="mx-auto">Expenses</span>
      </Link>
    </div>
  )}
</div>


        <Link to="/staffmember" className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded">
          <UserCog className="w-4 h-4" />
          {isOpen && <span className="">Staff Members</span>}
        </Link>

        {/* Reports */}
    <div>
  <button
    className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700 ${
      openMenus.reports || isDropdownActive(reportPaths) ? "bg-gray-700 shadow-md" : ""
    }`}
    onClick={() => toggleMenu("reports")}
  >
    <span className="flex items-center gap-3">
      <BarChart3 className="w-5 h-5" />
      {isOpen && "Reports"}
    </span>
    {isOpen && (
      <ChevronDown
        className={`w-4 h-4 transform transition-transform ${
          openMenus.reports || isDropdownActive(reportPaths) ? "rotate-180" : ""
        }`}
      />
    )}
  </button>

  {(openMenus.reports || isDropdownActive(reportPaths)) && isOpen && (
    <div className="ml-6 mt-1 space-y-1">
      <Link
        to="/reportlayout/payment"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/reportlayout/payment") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <CreditCard className="w-4 h-4" />
        <span className="mx-auto">Payments</span>
      </Link>
      <Link
        to="/reportlayout/salesummary"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/reportlayout/salesummary") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <TrendingUp className="w-4 h-4" />
        <span className="mx-auto">Sale Summary</span>
      </Link>
      <Link
        to="/reportlayout/stocksummary"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/reportlayout/stocksummary") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Boxes className="w-4 h-4" />
        <span className="mx-auto">Stock Summary</span>
      </Link>
      <Link
        to="/reportlayout/productsalessummary"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/reportlayout/productsalessummary") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Package className="w-4 h-4" />
        <span className="mx-auto">Product Sales</span>
      </Link>
      <Link
        to="/reportlayout/stockalert"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/reportlayout/stockalert") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <AlertTriangle className="w-4 h-4" />
        <span className="mx-auto">Stock Alert</span>
      </Link>
      <Link
        to="/reportlayout/expensereport"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/reportlayout/expensereport") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <FileBarChart className="w-4 h-4" />
        <span className="mx-auto">Expenses Report</span>
      </Link>
      <Link
        to="/reportlayout/userreport"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/reportlayout/userreport") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <UsersRound className="w-4 h-4" />
        <span className="mx-auto">User Report</span>
      </Link>
      <Link
        to="/reportlayout/ratelist"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/reportlayout/ratelist") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <ListChecks className="w-4 h-4" />
        <span className="mx-auto">Rate List</span>
      </Link>
      <Link
        to="/reportlayout/profitloss"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/reportlayout/profitloss") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <DollarSign className="w-4 h-4" />
        <span className="mx-auto">Profit & Loss</span>
      </Link>
    </div>
  )}
</div>


        {/* Utility */}
<div>
  <button
    className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700 ${
      openMenus.utility || isDropdownActive(utilityPaths) ? "bg-gray-700 shadow-md" : ""
    }`}
    onClick={() => toggleMenu("utility")}
  >
    <span className="flex items-center gap-3">
      <Briefcase className="w-5 h-5" />
      {isOpen && "Utility"}
    </span>
    {isOpen && (
      <ChevronDown
        className={`w-4 h-4 transform transition-transform ${
          openMenus.utility || isDropdownActive(utilityPaths) ? "rotate-180" : ""
        }`}
      />
    )}
  </button>

  {(openMenus.utility || isDropdownActive(utilityPaths)) && isOpen && (
    <div className="ml-6 mt-1 space-y-1">
      <Link
        to="/utilitylayout/productcard"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/utilitylayout/productcard") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Package className="w-4 h-4" />
        <span className="mx-auto">Product Card</span>
      </Link>
      <Link
        to="/utilitylayout/frontsettings"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/utilitylayout/frontsettings") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Settings className="w-4 h-4" />
        <span className="mx-auto">Front Settings</span>
      </Link>
    </div>
  )}
</div>


        <Link to="/onlineorder" className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded">
          <ShoppingCart className="w-4 h-4" />
          {isOpen && <span className="">Online Orders</span>}
        </Link>

        {/* HRM */}
<div>
  <button
    className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700 ${
      openMenus.hrm || isDropdownActive(hrmPaths) ? "bg-gray-700 shadow-md" : ""
    }`}
    onClick={() => toggleMenu("hrm")}
  >
    <span className="flex items-center gap-3">
      <UserCog className="w-5 h-5" />
      {isOpen && "HRM"}
    </span>
    {isOpen && (
      <ChevronDown
        className={`w-4 h-4 transform transition-transform ${
          openMenus.hrm || isDropdownActive(hrmPaths) ? "rotate-180" : ""
        }`}
      />
    )}
  </button>

  {(openMenus.hrm || isDropdownActive(hrmPaths)) && isOpen && (
    <div className="ml-6 mt-1 space-y-1">
      <Link
        to="/hrmlayout/dashboard"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/hrmlayout/dashboard") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Home className="w-4 h-4" />
        <span className="mx-auto">Dashboard</span>
      </Link>
      <Link
        to="/hrmlayout/holidays"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/hrmlayout/holidays") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Umbrella className="w-4 h-4" />
        <span className="mx-auto">Holidays</span>
      </Link>
      <Link
        to="/hrmlayout/leaves"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/hrmlayout/leaves") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <Calendar className="w-4 h-4" />
        <span className="mx-auto">Leaves</span>
      </Link>
      <Link
        to="/hrmlayout/attendance"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/hrmlayout/attendance") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <span className="mx-auto">Attendance</span>
      </Link>
      <Link
        to="/hrmlayout/payroll"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/hrmlayout/payroll") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <span className="mx-auto">Payroll</span>
      </Link>
      <Link
        to="/hrmlayout/hrmsetting"
        className={`flex items-center gap-3 p-2 rounded hover:bg-gray-700 ${
          isActivePath("/hrmlayout/hrmsetting") ? "bg-gray-700 shadow-md" : ""
        }`}
      >
        <span className="mx-auto">HRM Settings</span>
      </Link>
    </div>
  )}
</div>

        {/* Settings (opens side sidebar) */}
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
