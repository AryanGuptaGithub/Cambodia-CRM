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

function Sidebar({ isOpen, toggleSidebar, openSettingsSidebar }) {
  const location = useLocation();
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
          className={`flex items-center gap-3 p-2 rounded-md hover:bg-gray-700 ${
            location.pathname === "/" ? "bg-gray-700" : ""
          }`}
        >
          <Home className="w-5 h-5" />
          {isOpen && <span className="mx-auto">Dashboard</span>}
        </Link>

        {/* Master Dropdown */}
        <div>
          <button
            className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700"
            onClick={() => toggleMenu("master")}
          >
            <span className="flex  items-center gap-17">
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
                className="flex items-center gap-3 p-2 rounded hover:bg-gray-700"
              >
                <Users className="w-4 h-4" />
                <span className="mx-auto">Customers</span>
              </Link>
              <Link
                to="/masterlayout/supplier"
                className="flex items-center gap-3 p-2 rounded hover:bg-gray-700"
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
            className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700"
            onClick={() => toggleMenu("products")}
          >
            <span className="flex items-center gap-7">
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
              <Link to="/productmanagerlayout/brands" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Tags className="w-4 h-4" />
                <span className="mx-auto">Brands</span>
              </Link>
              <Link to="/productmanagerlayout/categories" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Layers className="w-4 h-4" />
                <span className="mx-auto">Categories</span>
              </Link>
              <Link to="/productmanagerlayout/product" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Boxes className="w-4 h-4" />
                <span className="mx-auto">Products</span>
              </Link>
              <Link to="/productmanagerlayout/variation" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <ClipboardList className="w-4 h-4" />
                <span className="mx-auto">Variations</span>
              </Link>
              <Link to="/productmanagerlayout/printbarcode" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Barcode className="w-4 h-4" />
                <span className="mx-auto">Print Barcode</span>
              </Link>
            </div>
          )}
        </div>

        {/* Purchases */}
        <div>
          <button
            className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700"
            onClick={() => toggleMenu("purchase")}
          >
            <span className="flex items-center gap-14">
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
              <Link to="/purchaselayout/purchase" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Package className="w-4 h-4" />
                <span className="mx-auto">Purchase</span>
              </Link>
              <Link to="/purchaselayout/crnote" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <FileText className="w-4 h-4" />
                <span className="mx-auto">Purchase/Cr.Note</span>
              </Link>
              <Link to="/purchaselayout/purchaseout" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Truck className="w-4 h-4" />
                <span className="mx-auto">Purchase Out</span>
              </Link>
            </div>
          )}
        </div>

        {/* Sales */}
        <div>
          <button
            className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700"
            onClick={() => toggleMenu("sales")}
          >
            <span className="flex items-center gap-15">
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
              <Link to="/salelayout/sale" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <DollarSign className="w-4 h-4" />
                <span className="mx-auto">Sale</span>
              </Link>
              <Link to="/salelayout/salereturn" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <FileText className="w-4 h-4" />
                <span className="mx-auto">Sale Return/Cr.Note</span>
              </Link>
              <Link to="/salelayout/payment" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <CreditCard className="w-4 h-4" />
                <span className="mx-auto">Payment In</span>
              </Link>
              <Link to="/salelayout/quotation" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <ClipboardList className="w-4 h-4" />
                <span className="mx-auto">Quotation</span>
              </Link>
            </div>
          )}
        </div>

        {/* Example: single links with icons */}
        <Link to="/stockadjustment" className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded">
          <ListChecks className="w-4 h-4" />
          {isOpen && <span className="mx-auto">Stock Adjustment</span>}
        </Link>

        <Link to="/stocktransfer" className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded">
          <Truck className="w-4 h-4" />
          {isOpen && <span className="mx-auto">Stock Transfer</span>}
        </Link>

        <Link to="/cashandbank" className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded">
          <Wallet className="w-4 h-4" />
          {isOpen && <span className="mx-auto">Cash & Bank</span>}
        </Link>

        {/* Expenses Dropdown */}
        <div>
          <button
            className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700"
            onClick={() => toggleMenu("expense")}
          >
            <span className="flex items-center gap-15">
              <FileText className="w-5 h-5" />
              {isOpen && "Expense"}
            </span>
            {isOpen && (
              <ChevronDown
                className={`w-4 h-4 transform transition-transform ${
                  openMenus.expense ? "rotate-180" : ""
                }`}
              />
            )}
          </button>
          {openMenus.expense && isOpen && (
            <div className="ml-6 mt-1 space-y-1">
              <Link to="/expenselayout/expensecategories" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Layers className="w-4 h-4" />
                <span className="mx-auto">Expense Categories</span>
              </Link>
              <Link to="/expenselayout/expenses" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <DollarSign className="w-4 h-4" />
                <span className="mx-auto">Expenses</span>
              </Link>
            </div>
          )}
        </div>

        <Link to="/staffmember" className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded">
          <UserCog className="w-4 h-4" />
          {isOpen && <span className="mx-auto">Staff Members</span>}
        </Link>

        {/* Reports */}
        <div>
          <button
            className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700"
            onClick={() => toggleMenu("reports")}
          >
            <span className="flex items-center gap-15">
              <BarChart3 className="w-5 h-5" />
              {isOpen && "Reports"}
            </span>
            {isOpen && (
              <ChevronDown
                className={`w-4 h-4 transform transition-transform ${
                  openMenus.reports ? "rotate-180" : ""
                }`}
              />
            )}
          </button>
          {openMenus.reports && isOpen && (
            <div className="ml-6 mt-1 space-y-1">
              <Link to="/reportlayout/payment" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <CreditCard className="w-4 h-4" />
                <span className="mx-auto">Payments</span>
              </Link>
              <Link to="/reportlayout/salesummary" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <TrendingUp className="w-4 h-4" />
                <span className="mx-auto">Sale Summary</span>
              </Link>
              <Link to="/reportlayout/stocksummary" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Boxes className="w-4 h-4" />
                <span className="mx-auto">Stock Summary</span>
              </Link>
              <Link to="/reportlayout/productsalessummary" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Package className="w-4 h-4" />
                <span className="mx-auto">Product Sales</span>
              </Link>
              <Link to="/reportlayout/stockalert" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <AlertTriangle className="w-4 h-4" />
                <span className="mx-auto">Stock Alert</span>
              </Link>
              <Link to="/reportlayout/expensereport" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <FileBarChart className="w-4 h-4" />
                <span className="mx-auto">Expenses Report</span>
              </Link>
              <Link to="/reportlayout/userreport" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <UsersRound className="w-4 h-4" />
                <span className="mx-auto">User Report</span>
              </Link>
              <Link to="/reportlayout/ratelist" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <ListChecks className="w-4 h-4" />
                <span className="mx-auto">Rate List</span>
              </Link>
              <Link to="/reportlayout/profitloss" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <DollarSign className="w-4 h-4" />
                <span className="mx-auto">Profit & Loss</span>
              </Link>
            </div>
          )}
        </div>

        {/* Utility */}
        <div>
          <button
            className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700"
            onClick={() => toggleMenu("utility")}
          >
            <span className="flex items-center gap-15">
              <Briefcase className="w-5 h-5" />
              {isOpen && "Utility"}
            </span>
            {isOpen && (
              <ChevronDown
                className={`w-4 h-4 transform transition-transform ${
                  openMenus.utility ? "rotate-180" : ""
                }`}
              />
            )}
          </button>
          {openMenus.utility && isOpen && (
            <div className="ml-6 mt-1 space-y-1">
              <Link to="/utilitylayout/productcard" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Package className="w-4 h-4" />
                <span className="mx-auto">Product Card</span>
              </Link>
              <Link to="/utilitylayout/frontsettings" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Settings className="w-4 h-4" />
                <span className="mx-auto">Front Settings</span>
              </Link>
            </div>
          )}
        </div>

        <Link to="/onlineorder" className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded">
          <ShoppingCart className="w-4 h-4" />
          {isOpen && <span className="mx-auto">Online Orders</span>}
        </Link>

        {/* HRM */}
        <div>
          <button
            className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-700"
            onClick={() => toggleMenu("hrm")}
          >
            <span className="flex items-center gap-15">
              <UserCog className="w-5 h-5" />
              {isOpen && "HRM"}
            </span>
            {isOpen && (
              <ChevronDown
                className={`w-4 h-4 transform transition-transform ${
                  openMenus.hrm ? "rotate-180" : ""
                }`}
              />
            )}
          </button>
          {openMenus.hrm && isOpen && (
            <div className="ml-6 mt-1 space-y-1">
              <Link to="/hrmlayout/dashboard" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Home className="w-4 h-4" />
                <span className="mx-auto">Dashboard</span>
              </Link>
              <Link to="/hrmlayout/holidays" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Umbrella className="w-4 h-4" />
                <span className="mx-auto">Holidays</span>
              </Link>
              <Link to="/hrmlayout/leaves" className="flex items-center gap-3 p-2 rounded hover:bg-gray-700">
                <Calendar className="w-4 h-4" />
                <span className="mx-auto">Leaves</span>
              </Link>
              <Link to="/hrmlayout/attendance" className="block p-2 hover:bg-gray-700 rounded">
       Attendance
              </Link>
              <Link to="/hrmlayout/payroll" className="block p-2 hover:bg-gray-700 rounded">
            Payroll
              </Link>
              <Link to="/hrmlayout/hrmsetting" className="block p-2 hover:bg-gray-700 rounded">
            HRM Settings
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
