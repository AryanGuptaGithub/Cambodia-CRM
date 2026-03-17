import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/User.js";
import SaleType from "./models/reports/saleType.js";
import OrderStatus from "./models/stock/orderStatus.js";
import Destination from "./models/accounts/Destination.js";
import CategoryType from "./models/accounts/CategoryType.js";
import TransactionType from "./models/accounts/TransactionType.js";
import Province from "./models/master/Province.js";
import HTab from "./models/settings/tabSetting.js";
import Zone from "./models/master/zone.js";
import BusinessType from "./models/master/businessTypes.js";
import ProductType from "./models/projectManger/productType.js";
import ProductPackingType from "./models/projectManger/ProductPackingType.js";
import AllowanceType from "./models/Hrm/AllowanceType.js";
import MRCash from "./models/accounts/MRCash.js";
import Staff from "./models/staffMember/staff.js";
// 👇 ADD THIS IMPORT
import StockAdjustment from "./models/stock/stockAdjustment.js";

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
    {
      name: "ktan",
      username: "Ketan",
      email: "ktan178@gmail.com",
      password: "Ktan@2026",
      role: "admin",
    },
    {
      name: "admin",
      username: "admin",
      email: "admin@example.com",
      password: "123456",
      role: "admin",
    },
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
     { name: "To Collection", code: "collection" },
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

function slugify(text) {
  return text.toLowerCase().trim().replace(/\s+/g, "_");
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
    { name: "Kratie", code: "kratie" },
    { name: "Mondulkiri", code: "mondulkiri" },
    { name: "Oddar Meanchey", code: "oddar_meanchey" },
    { name: "Pailin", code: "pailin" },
    { name: "Phnom Penh", code: "phnom_penh" },
    { name: "Preah Vihear", code: "preah_vihear" },
    { name: "Prey Veng", code: "prey_veng" },
    { name: "Pursat", code: "pursat" },
    { name: "Ratanakiri", code: "ratanakiri" },
    { name: "Siem Reap", code: "siem_reap" },
    { name: "Sihanoukville", code: "sihanoukville" },
  ];
  await Province.insertMany(provinces);
}

async function seedZones() {
  try {
    await Zone.deleteMany({});

    const provinces = await Province.find({});
    const provinceMap = {};
    provinces.forEach((p) => {
      provinceMap[p.name.trim().toLowerCase()] = p._id;
    });

    const zones = [
      // Phnom Penh (14 districts)
      { name: "Chamkar Mon", province: "phnom penh" },
      { name: "Doun Penh", province: "phnom penh" },
      { name: "Prampir Meakkakra", province: "phnom penh" },
      { name: "Tuol Kouk", province: "phnom penh" },
      { name: "Dangkao", province: "phnom penh" },
      { name: "Mean Chey", province: "phnom penh" },
      { name: "Russey Keo", province: "phnom penh" },
      { name: "Sen Sok", province: "phnom penh" },
      { name: "Pou Senchey", province: "phnom penh" },
      { name: "Chroy Changvar", province: "phnom penh" },
      { name: "Prek Pnov", province: "phnom penh" },
      { name: "Chbar Ampov", province: "phnom penh" },
      { name: "Boeng Keng Kang", province: "phnom penh" },
      { name: "Kamboul", province: "phnom penh" },

      // Banteay Meanchey (9 districts)
      { name: "Mongkol Borei", province: "banteay meanchey" },
      { name: "Phnum Srok", province: "banteay meanchey" },
      { name: "Preah Netr Preah", province: "banteay meanchey" },
      { name: "Ou Chrov", province: "banteay meanchey" },
      { name: "Serei Saophoan", province: "banteay meanchey" },
      { name: "Thma Puok", province: "banteay meanchey" },
      { name: "Svay Chek", province: "banteay meanchey" },
      { name: "Malai", province: "banteay meanchey" },
      { name: "Paoy Paet", province: "banteay meanchey" },

      // Battambang (14 districts)
      { name: "Banan", province: "battambang" },
      { name: "Thma Koul", province: "battambang" },
      { name: "Battambang", province: "battambang" },
      { name: "Bavel", province: "battambang" },
      { name: "Aek Phnum", province: "battambang" },
      { name: "Moung Ruessei", province: "battambang" },
      { name: "Rotanak Mondol", province: "battambang" },
      { name: "Sangkae", province: "battambang" },
      { name: "Samlout", province: "battambang" },
      { name: "Sampov Lun", province: "battambang" },
      { name: "Phnum Proek", province: "battambang" },
      { name: "Kamrieng", province: "battambang" },
      { name: "Koas Krala", province: "battambang" },
      { name: "Rukhak Kiri", province: "battambang" },

      // Kampong Cham (10 districts)
      { name: "Batheay", province: "kampong cham" },
      { name: "Chamkar Leu", province: "kampong cham" },
      { name: "Cheung Prey", province: "kampong cham" },
      { name: "Kampong Cham", province: "kampong cham" },
      { name: "Kampong Siem", province: "kampong cham" },
      { name: "Kang Meas", province: "kampong cham" },
      { name: "Koh Sotin", province: "kampong cham" },
      { name: "Prey Chhor", province: "kampong cham" },
      { name: "Srey Santhor", province: "kampong cham" },
      { name: "Stueng Trang", province: "kampong cham" },

      // Kampong Chhnang (8 districts)
      { name: "Baribour", province: "kampong chhnang" },
      { name: "Chol Kiri", province: "kampong chhnang" },
      { name: "Kampong Chhnang", province: "kampong chhnang" },
      { name: "Kampong Leaeng", province: "kampong chhnang" },
      { name: "Kampong Tralach", province: "kampong chhnang" },
      { name: "Rolea B'ier", province: "kampong chhnang" },
      { name: "Sameakki Mean Chey", province: "kampong chhnang" },
      { name: "Tuek Phos", province: "kampong chhnang" },

      // Kampong Speu (8 districts)
      { name: "Basedth", province: "kampong speu" },
      { name: "Chbar Mon", province: "kampong speu" },
      { name: "Kong Pisei", province: "kampong speu" },
      { name: "Aoral", province: "kampong speu" },
      { name: "Odongk", province: "kampong speu" },
      { name: "Phnum Sruoch", province: "kampong speu" },
      { name: "Samraong Tong", province: "kampong speu" },
      { name: "Thpong", province: "kampong speu" },

      // Kampong Thom (8 districts)
      { name: "Baray", province: "kampong thom" },
      { name: "Kampong Svay", province: "kampong thom" },
      { name: "Stueng Saen", province: "kampong thom" },
      { name: "Prasat Balangk", province: "kampong thom" },
      { name: "Prasat Sambour", province: "kampong thom" },
      { name: "Sandaan", province: "kampong thom" },
      { name: "Stoung", province: "kampong thom" },
      { name: "Kampong Thom", province: "kampong thom" },

      // Kampot (8 districts)
      { name: "Angkor Chey", province: "kampot" },
      { name: "Banteay Meas", province: "kampot" },
      { name: "Chhuk", province: "kampot" },
      { name: "Chum Kiri", province: "kampot" },
      { name: "Dang Tong", province: "kampot" },
      { name: "Kampong Trach", province: "kampot" },
      { name: "Tuek Chhou", province: "kampot" },
      { name: "Kampot", province: "kampot" },

      // Kandal (11 districts)
      { name: "Kandal Stueng", province: "kandal" },
      { name: "Kien Svay", province: "kandal" },
      { name: "Khsach Kandal", province: "kandal" },
      { name: "Kaoh Thum", province: "kandal" },
      { name: "Leuk Daek", province: "kandal" },
      { name: "Lvea Aem", province: "kandal" },
      { name: "Mukh Kampul", province: "kandal" },
      { name: "Angk Snuol", province: "kandal" },
      { name: "Ponhea Lueu", province: "kandal" },
      { name: "S'ang", province: "kandal" },
      { name: "Ta Khmau", province: "kandal" },

      // Kep (2 districts)
      { name: "Damnak Chang'aeur", province: "kep" },
      { name: "Kep", province: "kep" },

      // Koh Kong (8 districts)
      { name: "Botum Sakor", province: "koh kong" },
      { name: "Kiri Sakor", province: "koh kong" },
      { name: "Koh Kong", province: "koh kong" },
      { name: "Smach Mean Chey", province: "koh kong" },
      { name: "Mondol Seima", province: "koh kong" },
      { name: "Srae Ambel", province: "koh kong" },
      { name: "Thma Bang", province: "koh kong" },
      { name: "Kampong Seila", province: "koh kong" },

      // Kratie (6 districts)
      { name: "Chhloung", province: "kratie" },
      { name: "Kratie", province: "kratie" },
      { name: "Preaek Prasab", province: "kratie" },
      { name: "Sambour", province: "kratie" },
      { name: "Snuol", province: "kratie" },
      { name: "Chitr Borie", province: "kratie" },

      // Mondulkiri (5 districts)
      { name: "Kaev Seima", province: "mondulkiri" },
      { name: "Kaoh Nheaek", province: "mondulkiri" },
      { name: "Ou Reang", province: "mondulkiri" },
      { name: "Pechr Chenda", province: "mondulkiri" },
      { name: "Senmonorom", province: "mondulkiri" },

      // Oddar Meanchey (5 districts)
      { name: "Anlong Veaeng", province: "oddar meanchey" },
      { name: "Banteay Ampil", province: "oddar meanchey" },
      { name: "Chong Kal", province: "oddar meanchey" },
      { name: "Samraong", province: "oddar meanchey" },
      { name: "Trapeang Prasat", province: "oddar meanchey" },

      // Pailin (2 districts)
      { name: "Pailin", province: "pailin" },
      { name: "Sala Krau", province: "pailin" },

      // Preah Vihear (7 districts)
      { name: "Chey Saen", province: "preah vihear" },
      { name: "Chhaeb", province: "preah vihear" },
      { name: "Choam Khsant", province: "preah vihear" },
      { name: "Kuleaen", province: "preah vihear" },
      { name: "Rovieng", province: "preah vihear" },
      { name: "Sangkum Thmei", province: "preah vihear" },
      { name: "Tbaeng Mean Chey", province: "preah vihear" },

      // Prey Veng (13 districts)
      { name: "Ba Phnum", province: "prey veng" },
      { name: "Kamchay Mear", province: "prey veng" },
      { name: "Kampong Trabaek", province: "prey veng" },
      { name: "Kanhchriech", province: "prey veng" },
      { name: "Me Sang", province: "prey veng" },
      { name: "Peam Chor", province: "prey veng" },
      { name: "Peam Ro", province: "prey veng" },
      { name: "Pea Reang", province: "prey veng" },
      { name: "Prey Veaeng", province: "prey veng" },
      { name: "Preah Sdach", province: "prey veng" },
      { name: "Sithor Kandal", province: "prey veng" },
      { name: "Svay Antor", province: "prey veng" },
      { name: "Kampong Leav", province: "prey veng" },

      // Pursat (6 districts)
      { name: "Bakan", province: "pursat" },
      { name: "Kandieng", province: "pursat" },
      { name: "Krakor", province: "pursat" },
      { name: "Phnum Kravanh", province: "pursat" },
      { name: "Pursat", province: "pursat" },
      { name: "Veal Veaeng", province: "pursat" },

      // Ratanakiri (9 districts)
      { name: "Andoung Meas", province: "ratanakiri" },
      { name: "Banlung", province: "ratanakiri" },
      { name: "Bar Kaev", province: "ratanakiri" },
      { name: "Koun Mom", province: "ratanakiri" },
      { name: "Lumphat", province: "ratanakiri" },
      { name: "Ou Chum", province: "ratanakiri" },
      { name: "Ou Ya Dav", province: "ratanakiri" },
      { name: "Ta Veaeng", province: "ratanakiri" },
      { name: "Veun Sai", province: "ratanakiri" },

      // Siem Reap (12 districts)
      { name: "Angkor Chum", province: "siem reap" },
      { name: "Angkor Thum", province: "siem reap" },
      { name: "Banteay Srei", province: "siem reap" },
      { name: "Chi Kraeng", province: "siem reap" },
      { name: "Kralanh", province: "siem reap" },
      { name: "Puok", province: "siem reap" },
      { name: "Prasat Bakong", province: "siem reap" },
      { name: "Siem Reap", province: "siem reap" },
      { name: "Soutr Nikom", province: "siem reap" },
      { name: "Srei Snam", province: "siem reap" },
      { name: "Svay Leu", province: "siem reap" },
      { name: "Varin", province: "siem reap" },

      // Sihanoukville (4 districts)
      { name: "Mittapheap", province: "sihanoukville" },
      { name: "Prey Nob", province: "sihanoukville" },
      { name: "Stueng Hav", province: "sihanoukville" },
      { name: "Kampong Seila", province: "sihanoukville" },
    ];

    const provincesWithZones = new Set(
      zones.map((z) => z.province.trim().toLowerCase())
    );

    provinces.forEach((province) => {
      const provinceKey = province.name.trim().toLowerCase();
      if (!provincesWithZones.has(provinceKey)) {
        zones.push({
          name: province.name,
          province: provinceKey,
        });
      }
    });

    const formattedZones = zones.map((z) => {
      const provinceKey = z.province.trim().toLowerCase();
      const provinceId = provinceMap[provinceKey];

      if (!provinceId) {
        throw new Error(
          `❌ Province not found for zone: ${z.name} (${z.province})`
        );
      }

      return {
        name: z.name,
        provinceId,
      };
    });

    await Zone.insertMany(formattedZones);
  } catch (error) {
    console.error("❌ Error seeding zones:", error.message);
    throw error;
  }
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
    { name: "Pharmacy", code: "PHARMACY" },
    { name: "Cabinet", code: "CABINET" },
    { name: "Clinic", code: "CLINIC" },
    { name: "Hospital", code: "HOSPITAL" },
    { name: "Wholesaler", code: "WHOLESALER" },
    { name: "Company", code: "COMPANY" },
    { name: "Staff", code: "STAFF" },
    { name: "Nurse", code: "NURSE" },
    { name: "Cutter", code: "CUTTER" },
    { name: "Agent", code: "AGENT" },
    { name: "Other", code: "OTHER" },
    { name: "NGO", code: "NGO" },
  ];
  await BusinessType.insertMany(businessTypes);
}

async function seedProductTypes() {
  try {
    await ProductType.deleteMany({});
    const productTypes = [
      { name: "Tab", code: "tab" },
      { name: "Cap", code: "cap" },
      { name: "Bottle", code: "bottle" },
      { name: "Injection", code: "injection" },
      { name: "Eye Drop", code: "eye_drop" },
    ];
    await ProductType.insertMany(productTypes);
  } catch (error) {
    console.error("❌ Error seeding product types:", error);
  }
}

async function seedProductPackingTypes() {
  try {
    await ProductPackingType.deleteMany({});
    const packingTypes = [
      { name: "10x10", code: "10x10" },
      { name: "3x10", code: "3x10" },
      { name: "10x3", code: "10x3" },
      { name: "2x15", code: "2x15" },
      { name: "1 bottle", code: "1_bottle" },
      { name: "10x1x10", code: "10x1x10" },
      { name: "50x1", code: "50x1" },
      { name: "5x10", code: "5x10" },
      { name: "1x5", code: "1x5" },
      { name: "1 Vial", code: "1_vial" },
    ];
    await ProductPackingType.insertMany(packingTypes);
  } catch (error) {
    console.error("❌ Error seeding product packing types:", error);
  }
}

async function seedAllowanceTypes() {
  try {
    await AllowanceType.deleteMany({});
    const allowanceTypes = [
      { name: "House Rent Allowance", code: "house_rent_allowance" },
      { name: "Dearness Allowance", code: "dearness_allowance" },
      { name: "Conveyance Allowance", code: "conveyance_allowance" },
      { name: "Medical Allowance", code: "medical_allowance" },
      { name: "Special Allowance", code: "special_allowance" },
      { name: "Travel Allowance", code: "travel_allowance" },
      { name: "Bonus", code: "bonus" },
      { name: "Overtime", code: "overtime" },
      { name: "Incentive", code: "incentive" },
      { name: "Other", code: "other" },
    ];
    await AllowanceType.insertMany(allowanceTypes);
  } catch (error) {
    console.error("❌ Error seeding allowance types:", error);
  }
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
      tabId: "mrCarryStock",
      name: "MR Carry Stock",
      description: "MR Carry Stock management",
      path: "",
      icon: "UserCheck",
      level: 0,
      sequence: 9,
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
      sequence: 10,
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
      sequence: 11,
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
      sequence: 12,
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
      sequence: 13,
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
      sequence: 14,
      category: "utility",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "onlineOrders",
      name: "Online Orders",
      description: "Online orders management",
      path: "/onlineOrders",
      icon: "ShoppingBag",
      level: 0,
      sequence: 15,
      category: "main",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "hrm",
      name: "HRM",
      description: "Human Resource Management",
      path: "",
      icon: "UserCog",
      level: 0,
      sequence: 16,
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

    // MR Carry Stock Sub-tabs (Level 1)
    {
      tabId: "mrCarryStock_carrystockview",
      name: "Carry Stock View",
      description: "View MR carry stock",
      path: "/mrCarryStocklayout/carrystockview",
      icon: "Eye",
      parentTabId: "mrCarryStock",
      level: 1,
      sequence: 1,
      category: "main",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "mrCarryStock_stockreturn",
      name: "Stock Return",
      description: "Stock return management",
      path: "/mrCarryStocklayout/stockreturn",
      icon: "RotateCcw",
      parentTabId: "mrCarryStock",
      level: 1,
      sequence: 2,
      category: "main",
      reportType: "Hide/Show Tabs",
    },

    // Accounts Sub-tabs (Level 1)
    {
      tabId: "accounts_cashbank",
      name: "Cash & Bank",
      description: "Cash and bank account management",
      path: "/accountlayout",
      icon: "Wallet",
      parentTabId: "accounts",
      level: 1,
      sequence: 1,
      category: "accounts",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "accounts_mrcash",
      name: "MR Cash",
      description: "MR cash management",
      path: "/accountlayout/mrcash",
      icon: "Coins",
      parentTabId: "accounts",
      level: 1,
      sequence: 2,
      category: "accounts",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "accounts_mrcashtransfer",
      name: "MR Cash Transfer to Admin",
      description: "MR cash transfer to admin management",
      path: "/accountlayout/mrcashtransfer",
      icon: "RefreshCw",
      parentTabId: "accounts",
      level: 1,
      sequence: 3,
      category: "accounts",
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
    {
      tabId: "reports_expirystock",
      name: "Expiry Stock Report",
      description: "Expiry stock report and analytics",
      path: "/reportlayout/expiry-stock-report",
      icon: "Calendar",
      parentTabId: "reports",
      level: 1,
      sequence: 22,
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
      tabId: "hrm_leaveattendance",
      name: "Leave & Attendance",
      description: "Leave and attendance management",
      path: "/hrmlayout/leaveattendance",
      icon: "Calendar",
      parentTabId: "hrm",
      level: 1,
      sequence: 3,
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
      sequence: 4,
      category: "hrm",
      reportType: "Hide/Show Tabs",
    },
    {
      tabId: "hrm_mrbasicpayroll",
      name: "MR Basic Payroll",
      description: "MR basic payroll calculation and management",
      path: "/hrmlayout/mrbasicpayroll",
      icon: "BanknoteIcon",
      parentTabId: "hrm",
      level: 1,
      sequence: 5,
      category: "hrm",
      reportType: "Hide/Show Tabs",
    },
  ];

  await HTab.insertMany(sampleTabs);
  const count = await HTab.countDocuments();
}

async function seedMRCash() {
  try {
    const deleteResult = await MRCash.deleteMany({});
    const staffList = await Staff.find({});

    let mrStaffList = staffList.filter((staff) => {
      const role = staff.role || staff.staffRole || staff.position;
      return !role || role.toLowerCase().includes("mr") || role === "";
    });

    if (!mrStaffList.length) {
      mrStaffList = staffList;
    }

    const mrCashDocs = mrStaffList.map((staff) => {
      const name =
        staff.medicalRepName ||
        staff.name ||
        staff.employeeName ||
        staff.fullName ||
        `MR ${staff.MRId || staff._id.toString().slice(-4)}`;

      const createdById =
        staff.userId || staff.createdBy || new mongoose.Types.ObjectId();

      return {
        mrId: staff._id,
        mrName: name,
        currentCash: 1000,
        cashTransferredToAdmin: 100,
        lastTransferDate: new Date(),
        notes: `Team: ${staff.teamName || "N/A"}, MR ID: ${
          staff.MRId || "N/A"
        }`,
        isActive: staff.isActive !== false,
        createdBy: createdById,
        updatedBy: createdById,
      };
    });

    const result = await MRCash.insertMany(mrCashDocs);
  } catch (error) {
    console.error("❌ Error seeding MRCash:", error.message);
  }
}

// 👇 NEW SEED FUNCTION FOR STOCK ADJUSTMENT
async function seedStockAdjustment() {
  try {
    // Optional: remove if you want to keep existing records
    await StockAdjustment.deleteMany({});

    const adjustmentData = {
      _id: new mongoose.Types.ObjectId("6997e760f0d79390f344868c"), // 👈 ADD THIS
      productId: new mongoose.Types.ObjectId("699560c62dfafd5ece0d1e54"),
      boxQuantity: 220,
      totalQuantity: 220,
      adjustmentType: "add",
      remarks: "test",
      createdAt: new Date("2026-02-20T04:47:28.742Z"),
      updatedAt: new Date("2026-02-20T04:47:28.742Z"),
      // __v is automatically added by Mongoose, do not include it
    };

    await StockAdjustment.create(adjustmentData);
    console.log("✅ Stock adjustment seeded successfully.");
  } catch (error) {
    console.error("❌ Error seeding stock adjustment:", error.message);
  }
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
    await seedProductTypes();
    await seedProductPackingTypes();
    await seedAllowanceTypes();
    await seedHTabs();
    await seedMRCash();
    await seedStockAdjustment();
  } catch (error) {
    console.error("\n❌ Seeding error:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

runSeeders();