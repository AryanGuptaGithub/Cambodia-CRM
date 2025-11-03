import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/User.js";
import SaleType from "./models/reports/saleType.js";
import Warehouse from "./models/stock/warehouse.js";
import OrderStatus from "./models/stock/orderStatus.js";
import Destination from "./models/accounts/Destination.js";
import CategoryType from "./models/accounts/CategoryType.js";
import TransactionType from "./models/accounts/TransactionType.js";
import Province from "./models/master/Province.js";
import HTab from "./models/settings/tabSetting.js";
import Zone from "./models/master/zone.js"; // Import Zone model
import BusinessType from "./models/master/businessTypes.js"; // Fixed import name

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

async function seedUsers() {
  await User.deleteMany({});
  const users = [
    { username: "superadmin", password: "123456", role: "super-admin" },
    { username: "admin", password: "123456", role: "admin" },
  ];

  for (const u of users) {
    const user = new User(u);
    await user.save();
  }
}

async function seedDestinations() {
  await Destination.deleteMany({});
  const destinations = [
    { name: "Cash Balance", code: "cash_balance", totalAmount: 0 },
    { name: "Personal Account", code: "personal_account", totalAmount: 0 },
    { name: "Company Account", code: "company_account", totalAmount: 0 },
  ];
  await Destination.insertMany(destinations);
}

async function seedCategoryTypes() {
  await CategoryType.deleteMany({});
  const categoryTypes = [
    { name: "Withdraw", code: "withdraw" },
    { name: "Remittance", code: "remittance" },
    { name: "Deposit", code: "deposit" },
    { name: "Cash Sale", code: "cash_sale" },
    { name: "Credit Collections", code: "credit_collections" },
    { name: "Payment Inward", code: "payment_inward" },
  ];
  await CategoryType.insertMany(categoryTypes);
}

async function seedTransactionTypes() {
  await TransactionType.deleteMany({});
  const transactionTypes = [
    { name: "Income", code: "income" },
    { name: "Expense", code: "expense" },
    { name: "Transfer", code: "transfer" },
    { name: "Adjustment", code: "adjustment" },
  ];
  await TransactionType.insertMany(transactionTypes);
}

async function seedProvinces() {
  await Province.deleteMany({});
  const provinces = [
    { name: "Banteay Meanchey", code: "banteay_meanchey" },
    { name: "Battambang", code: "battambang" },
    { name: "Kampong Cham", code: "kampong_cham" },
    { name: "Kampong Chhnang", code: "kampong_chhnang" },
    { name: "Kampong Speu", code: "kampong_speu" },
    { name: "Kampong Thom", code: "kampong_thom" },
    { name: "Kampot", code: "kampot" },
    { name: "Kandal", code: "kandal" },
    { name: "Kep", code: "kep" },
    { name: "Koh Kong", code: "koh_kong" },
    { name: "Kratié", code: "kratie" },
    { name: "Mondulkiri", code: "mondulkiri" },
    { name: "Oddar Meanchey", code: "oddar_meanchey" },
    { name: "Pailin", code: "pailin" },
    { name: "Phnom Penh", code: "phnom_penh" },
    { name: "Preah Sihanouk", code: "preah_sihanouk" },
    { name: "Preah Vihear", code: "preah_vihear" },
    { name: "Prey Veng", code: "prey_veng" },
    { name: "Pursat", code: "pursat" },
    { name: "Ratanakiri", code: "ratanakiri" },
    { name: "Siem Reap", code: "siem_reap" },
    { name: "Stung Treng", code: "stung_treng" },
    { name: "Svay Rieng", code: "svay_rieng" },
    { name: "Takéo", code: "takeo" },
    { name: "Tboung Khmum", code: "tboung_khmum" },
  ];

  await Province.insertMany(provinces);
}

async function seedZones() {
  await Zone.deleteMany({});
  const zones = [
    { name: "North Zone", code: "north_zone" },
    { name: "South Zone", code: "south_zone" },
    { name: "East Zone", code: "east_zone" },
    { name: "West Zone", code: "west_zone" },
    { name: "Central Zone", code: "central_zone" },
    { name: "Metro Zone", code: "metro_zone" },
    { name: "Urban Zone", code: "urban_zone" },
    { name: "Rural Zone", code: "rural_zone" },
    { name: "Commercial Zone", code: "commercial_zone" },
    { name: "Industrial Zone", code: "industrial_zone" },
  ];

  await Zone.insertMany(zones);
}

async function seedSaleTypes() {
  await SaleType.deleteMany({});
  const saleTypes = [
    { type: "Total Sales", sequenceNumber: 1 },
    { type: "Cash Sales", sequenceNumber: 2 },
    { type: "Credit Sales", sequenceNumber: 3 },
  ];

  await SaleType.insertMany(saleTypes);
}



async function seedOrderStatuses() {
  await OrderStatus.deleteMany({});
  const orderStatuses = [
    {
      name: "Draft",
      code: "draft",
      description: "Initial draft state of the order",
    },
    {
      name: "Confirmed",
      code: "confirmed",
      description: "Order has been confirmed and approved",
    },
    {
      name: "Shipped",
      code: "shipped",
      description: "Items have been shipped to destination",
    },
    {
      name: "Delivered",
      code: "delivered",
      description: "Items have been successfully delivered",
    },
  ];

  await OrderStatus.insertMany(orderStatuses);
}

async function seedBusinessTypes() {
  await BusinessType.deleteMany({});
  const businessTypes = [
    { name: "Pharmacy", code: "pharmacy" },
    { name: "Cosmetic", code: "cosmetic" },
  ];

  await BusinessType.insertMany(businessTypes);
}

async function seedHTabs() {
  await HTab.deleteMany({});
  const sampleTabs = [
    {
      tabId: "dashboard",
      name: "Dashboard",
      description: "Main dashboard with overview",
      path: "/",
      icon: "Home",
      level: 0,
      sequence: 1,
      category: "main",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "master",
      name: "Master",
      description: "Master data management",
      path: "",
      icon: "Users",
      level: 0,
      sequence: 2,
      category: "main",
      reportType: "Hide/Show Tabs",
    },

    {
      tabId: "products",
      name: "Product Manager",
      description: "Product management",
      path: "",
      icon: "Package",
      level: 0,
      sequence: 4,
      category: "products",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "purchase",
      name: "Purchase",
      description: "Purchase management",
      path: "",
      icon: "ShoppingCart",
      level: 0,
      sequence: 5,
      category: "purchase",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "sales",
      name: "Sales",
      description: "Sales management",
      path: "",
      icon: "TrendingUp",
      level: 0,
      sequence: 6,
      category: "sales",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "stockAdjustment",
      name: "Stock Adjustment",
      description: "Stock adjustment management",
      path: "/stockadjustment",
      icon: "ListChecks",
      level: 0,
      sequence: 7,
      category: "main",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "stockTransfer",
      name: "Stock Transfer",
      description: "Stock transfer management",
      path: "/stocktransfer",
      icon: "Truck",
      level: 0,
      sequence: 8,
      category: "main",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "accounts",
      name: "Accounts",
      description: "Accounts management",
      path: "",
      icon: "Landmark",
      level: 0,
      sequence: 9,
      category: "accounts",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "expense",
      name: "Expense",
      description: "Expense management",
      path: "",
      icon: "FileText",
      level: 0,
      sequence: 10,
      category: "expense",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports",
      name: "Reports",
      description: "Reports and analytics",
      path: "",
      icon: "BarChart3",
      level: 0,
      sequence: 11,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "staff",
      name: "Staff Members",
      description: "Staff management",
      path: "/staffmemberLayout/staffmember",
      icon: "UserCog",
      level: 0,
      sequence: 12,
      category: "staff",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "utility",
      name: "Settings",
      description: "Utility settings",
      path: "",
      icon: "Settings",
      level: 0,
      sequence: 13,
      category: "utility",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "hrm",
      name: "HRM",
      description: "Human Resource Management",
      path: "",
      icon: "UserCog",
      level: 0,
      sequence: 14,
      category: "hrm",
      reportType: "Hide/Show Tabs",
    },

    // Master Sub-tabs (Level 1)
    {
      tabId: "master_customers",
      name: "Customers",
      description: "Customer management",
      path: "/masterlayout/customer",
      icon: "Users",
      parentTabId: "master",
      level: 1,
      sequence: 1,
      category: "main",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "master_suppliers",
      name: "Suppliers",
      description: "Supplier management",
      path: "/masterlayout/supplier",
      icon: "Truck",
      parentTabId: "master",
      level: 1,
      sequence: 2,
      category: "main",
      reportType: "Hide/Show Tabs",
    },

    // Settings Sub-tabs (Level 1)
    {
      tabId: "settings_companyprofile",
      name: "Company Profile",
      description: "Company profile settings",
      path: "/settingslayout/company-profile",
      icon: "Building",
      parentTabId: "settings",
      level: 1,
      sequence: 1,
      category: "settings",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "settings_tabmanipulation",
      name: "Tab Manipulation",
      description: "Tab hide/show and sequence management",
      path: "/settingslayout/tab-manipulation",
      icon: "Eye",
      parentTabId: "settings",
      level: 1,
      sequence: 2,
      category: "settings",
      reportType: "Hide/Show Tabs",
    },

    // Products Sub-tabs (Level 1)
    {
      tabId: "products_products",
      name: "Products",
      description: "Product management",
      path: "/productmanagerlayout/product",
      icon: "Boxes",
      parentTabId: "products",
      level: 1,
      sequence: 1,
      category: "products",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "products_pricelist",
      name: "Price List",
      description: "Price list management",
      path: "/productmanagerlayout/pricelist",
      icon: "ClipboardList",
      parentTabId: "products",
      level: 1,
      sequence: 2,
      category: "products",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "products_printbarcode",
      name: "Print Barcode",
      description: "Barcode printing",
      path: "/productmanagerlayout/printbarcode",
      icon: "Barcode",
      parentTabId: "products",
      level: 1,
      sequence: 3,
      category: "products",
      reportType: "Hide/Show Tabs",
    },

    // Purchase Sub-tabs (Level 1)
    {
      tabId: "purchase_purchase",
      name: "Purchase",
      description: "Purchase management",
      path: "/purchaselayout/purchase",
      icon: "Package",
      parentTabId: "purchase",
      level: 1,
      sequence: 1,
      category: "purchase",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "purchase_purchasereturn",
      name: "Purchase/Cr.Note",
      description: "Purchase return and credit notes",
      path: "/purchaselayout/purchasereturn",
      icon: "FileText",
      parentTabId: "purchase",
      level: 1,
      sequence: 2,
      category: "purchase",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "purchase_purchaseout",
      name: "Purchase Out",
      description: "Purchase out management",
      path: "/purchaselayout/purchaseout",
      icon: "Truck",
      parentTabId: "purchase",
      level: 1,
      sequence: 3,
      category: "purchase",
      reportType: "Hide/Show Tabs",
    },

    // Sales Sub-tabs (Level 1)
    {
      tabId: "sales_sale",
      name: "Sale",
      description: "Sales management",
      path: "/salelayout/sale",
      icon: "DollarSign",
      parentTabId: "sales",
      level: 1,
      sequence: 1,
      category: "sales",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "sales_salereturn",
      name: "Sale Return/Cr.Note",
      description: "Sales return and credit notes",
      path: "/salelayout/salereturn",
      icon: "FileText",
      parentTabId: "sales",
      level: 1,
      sequence: 2,
      category: "sales",
      reportType: "Hide/Show Tabs",
    },

    // Expense Sub-tabs (Level 1)
    {
      tabId: "expense_categories",
      name: "Expense Categories",
      description: "Expense categories management",
      path: "/expenselayout/expensecategories",
      icon: "Layers",
      parentTabId: "expense",
      level: 1,
      sequence: 1,
      category: "expense",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "expense_expenses",
      name: "Expenses",
      description: "Expenses management",
      path: "/expenselayout/expenses",
      icon: "DollarSign",
      parentTabId: "expense",
      level: 1,
      sequence: 2,
      category: "expense",
      reportType: "Hide/Show Tabs",
    },

    // Reports Sub-tabs (Level 1)
    {
      tabId: "reports_dailyreport",
      name: "Daily Reports",
      description: "Daily reports and analytics",
      path: "/reportlayout/dailyreport",
      icon: "CreditCard",
      parentTabId: "reports",
      level: 1,
      sequence: 1,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_averageprice",
      name: "Average Price Per Product",
      description: "Average price calculations",
      path: "/reportlayout/averageprice",
      icon: "Calculator",
      parentTabId: "reports",
      level: 1,
      sequence: 2,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_newcustomeraddition",
      name: "New Customer Addition",
      description: "New customer analytics",
      path: "/reportlayout/newcustomeraddition",
      icon: "UserPlus",
      parentTabId: "reports",
      level: 1,
      sequence: 3,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_masterCustomerReports",
      name: "Master Customer Report",
      description: "Customer related reports",
      path: "",
      icon: "Users",
      parentTabId: "reports",
      level: 1,
      sequence: 4,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_monthlyrepeatrate",
      name: "Monthly Customer Repeat Rate",
      description: "Monthly repeat customer analytics",
      path: "/reportlayout/monthlyrepeatrate",
      icon: "CalendarDays",
      parentTabId: "reports",
      level: 1,
      sequence: 5,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_annualrepeatrate",
      name: "Annual Customer Repeat Rate",
      description: "Annual repeat customer analytics",
      path: "/reportlayout/annualrepeatrate",
      icon: "CalendarRange",
      parentTabId: "reports",
      level: 1,
      sequence: 6,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_productreport",
      name: "Product Reports",
      description: "Product related reports",
      path: "/reportlayout/product-report",
      icon: "PackageSearch",
      parentTabId: "reports",
      level: 1,
      sequence: 7,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_mrwiseoutstanding",
      name: "MR Wise Outstanding",
      description: "MR wise outstanding reports",
      path: "/reportlayout/mrwiseoutstanding",
      icon: "UserSearch",
      parentTabId: "reports",
      level: 1,
      sequence: 8,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_mrwisesales",
      name: "MR Wise Sales",
      description: "MR wise sales reports",
      path: "/reportlayout/mrwisesales",
      icon: "Target",
      parentTabId: "reports",
      level: 1,
      sequence: 9,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_cashsales",
      name: "Total Cash Sales",
      description: "Cash sales reports",
      path: "/reportlayout/cashsales",
      icon: "DollarSign",
      parentTabId: "reports",
      level: 1,
      sequence: 10,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_outstandingcollection",
      name: "Outstanding Collection",
      description: "Outstanding collection reports",
      path: "/reportlayout/outstandingcollection",
      icon: "Receipt",
      parentTabId: "reports",
      level: 1,
      sequence: 11,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_totalexpense",
      name: "Total Expense",
      description: "Total expense reports",
      path: "/reportlayout/totalexpense",
      icon: "PieChart",
      parentTabId: "reports",
      level: 1,
      sequence: 12,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_remittance",
      name: "Remittance",
      description: "Remittance reports",
      path: "/reportlayout/remittance",
      icon: "Coins",
      parentTabId: "reports",
      level: 1,
      sequence: 13,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_provincewisesale",
      name: "Province Wise Sale",
      description: "Province wise sales reports",
      path: "/reportlayout/province-wise-sale",
      icon: "Globe",
      parentTabId: "reports",
      level: 1,
      sequence: 14,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_provincewisecustomer",
      name: "Province Wise Customer",
      description: "Province wise customer reports",
      path: "/reportlayout/province-wise-customer",
      icon: "Users",
      parentTabId: "reports",
      level: 1,
      sequence: 15,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_payment",
      name: "Payments",
      description: "Payment reports",
      path: "/reportlayout/payment",
      icon: "CreditCard",
      parentTabId: "reports",
      level: 1,
      sequence: 16,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_financeReports",
      name: "Finance Reports",
      description: "Financial reports and analytics",
      path: "",
      icon: "FileBarChart",
      parentTabId: "reports",
      level: 1,
      sequence: 17,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_reportsinhand",
      name: "Reports in Hand",
      description: "Reports in hand management",
      path: "/reportlayout/reports-in-hand",
      icon: "HandCoins",
      parentTabId: "reports",
      level: 1,
      sequence: 18,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_salesummary",
      name: "Sale Summary",
      description: "Sales summary reports",
      path: "/reportlayout/salesummary",
      icon: "TrendingUp",
      parentTabId: "reports",
      level: 1,
      sequence: 19,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_dailysample",
      name: "Daily Sample",
      description: "Daily sample reports",
      path: "/reportlayout/dailysample",
      icon: "Boxes",
      parentTabId: "reports",
      level: 1,
      sequence: 20,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "reports_profitloss",
      name: "Profit & Loss",
      description: "Profit and loss reports",
      path: "/reportlayout/profitloss",
      icon: "DollarSign",
      parentTabId: "reports",
      level: 1,
      sequence: 21,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },

    // Nested Sub-tabs (Level 2) - Master Customer Reports
    {
      tabId: "masterCustomerReports_retention",
      name: "Customer Retention Rate",
      description: "Customer retention analytics",
      path: "/reportlayout/customerretention",
      icon: "Repeat",
      parentTabId: "reports_masterCustomerReports",
      level: 2,
      sequence: 1,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "masterCustomerReports_acceptance",
      name: "Product Acceptance Rate",
      description: "Product acceptance analytics",
      path: "/reportlayout/customeracceptance",
      icon: "CheckCircle",
      parentTabId: "reports_masterCustomerReports",
      level: 2,
      sequence: 2,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "masterCustomerReports_zonewise",
      name: "Zone Wise Customers",
      description: "Zone wise customer analytics",
      path: "/reportlayout/zonewisecustomers",
      icon: "MapPin",
      parentTabId: "reports_masterCustomerReports",
      level: 2,
      sequence: 3,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },

    // Nested Sub-tabs (Level 2) - Finance Reports
    {
      tabId: "financeReports_salessalary",
      name: "Sales / Salary Ratio",
      description: "Sales to salary ratio analysis",
      path: "/reportlayout/sales-salary-ratio",
      icon: "Percent",
      parentTabId: "reports_financeReports",
      level: 2,
      sequence: 1,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "financeReports_salarycogs",
      name: "Salary / COGS Ratio",
      description: "Salary to COGS ratio analysis",
      path: "/reportlayout/salary-cogs-ratio",
      icon: "Scale",
      parentTabId: "reports_financeReports",
      level: 2,
      sequence: 2,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "financeReports_operationcostcogs",
      name: "Operation Cost / COGS",
      description: "Operation cost to COGS analysis",
      path: "/reportlayout/operation-cost-cogs-ratio",
      icon: "TrendingDown",
      parentTabId: "reports_financeReports",
      level: 2,
      sequence: 3,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "financeReports_operationcostsales",
      name: "Operation Cost / Sales",
      description: "Operation cost to sales analysis",
      path: "/reportlayout/operation-cost-sales-ratio",
      icon: "BarChart3",
      parentTabId: "reports_financeReports",
      level: 2,
      sequence: 4,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "financeReports_tourexpensesales",
      name: "Tour Expense / Sales",
      description: "Tour expense to sales analysis",
      path: "/reportlayout/tour-expense-sales-ratio",
      icon: "MapPin",
      parentTabId: "reports_financeReports",
      level: 2,
      sequence: 5,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "financeReports_plreport",
      name: "P&L Report",
      description: "Profit and loss report",
      path: "/reportlayout/pl-report",
      icon: "FileBarChart",
      parentTabId: "reports_financeReports",
      level: 2,
      sequence: 6,
      category: "reports",
      reportType: "Hide/Show Tabs",
    },

    // Utility Sub-tabs (Level 1)
    {
      tabId: "utility_companyprofile",
      name: "Company Profile",
      description: "Company profile settings",
      path: "/utilitylayout/companyprofile",
      icon: "Building",
      parentTabId: "utility",
      level: 1,
      sequence: 1,
      category: "utility",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "utility_tabhideview",
      name: "Tab Hide and Show",
      description: "Tab visibility management",
      path: "/utilitylayout/tabHideView",
      icon: "Eye",
      parentTabId: "utility",
      level: 1,
      sequence: 2,
      category: "utility",
      reportType: "Hide/Show Tabs",
    },

    // HRM Sub-tabs (Level 1)
    {
      tabId: "hrm_dashboard",
      name: "Dashboard",
      description: "HRM dashboard",
      path: "/hrmlayout/dashboard",
      icon: "Home",
      parentTabId: "hrm",
      level: 1,
      sequence: 1,
      category: "hrm",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "hrm_holidays",
      name: "Holidays",
      description: "Holiday management",
      path: "/hrmlayout/holidays",
      icon: "Umbrella",
      parentTabId: "hrm",
      level: 1,
      sequence: 2,
      category: "hrm",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "hrm_leaves",
      name: "Leaves",
      description: "Leave management",
      path: "/hrmlayout/leaves",
      icon: "Calendar",
      parentTabId: "hrm",
      level: 1,
      sequence: 3,
      category: "hrm",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "hrm_attendance",
      name: "Attendance",
      description: "Attendance management",
      path: "/hrmlayout/attendance",
      icon: "Calendar",
      parentTabId: "hrm",
      level: 1,
      sequence: 4,
      category: "hrm",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "hrm_payroll",
      name: "Payroll",
      description: "Payroll management",
      path: "/hrmlayout/payroll",
      icon: "DollarSign",
      parentTabId: "hrm",
      level: 1,
      sequence: 5,
      category: "hrm",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "hrm_settings",
      name: "HRM Settings",
      description: "HRM system settings",
      path: "/hrmlayout/hrmsetting",
      icon: "Settings",
      parentTabId: "hrm",
      level: 1,
      sequence: 6,
      category: "hrm",
      reportType: "Hide/Show Tabs",
    },
  ];

  await HTab.insertMany(sampleTabs);
  const count = await HTab.countDocuments();
}

// Run all seeders in order
async function runSeeders() {
  await connectDB();

  try {
    await seedUsers();
    await seedSaleTypes();
    await seedOrderStatuses();
    await seedDestinations();
    await seedCategoryTypes();
    await seedTransactionTypes();
    await seedProvinces();
    await seedZones(); 
    await seedBusinessTypes(); 
    await seedHTabs();
  } catch (error) {
    console.error("❌ Seeding error:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

runSeeders();