import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/User.js";
import SaleType from "./models/reports/saleType.js";
import Warehouse from "./models/stock/warehouse.js";
import OrderStatus from "./models/stock/orderStatus.js";
import Destination from "./models/accounts/Destination.js";
import CategoryType from "./models/accounts/CategoryType.js";
import TransactionType from "./models/accounts/TransactionType.js"; // ✅ Add this import

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

// Seed users
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

// ✅ CORRECTED: Seed destinations (with totalAmount)
async function seedDestinations() {
  await Destination.deleteMany({});
  const destinations = [
    { name: "Cash Balance", code: "cash_balance", totalAmount: 0 },
    { name: "Personal Account", code: "personal_account", totalAmount: 0 },
    { name: "Company Account", code: "company_account", totalAmount: 0 },
  ];

  await Destination.insertMany(destinations);
}

// ✅ Seed category types
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

// ✅ NEW: Seed transaction types
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

// Seed sale types
async function seedSaleTypes() {
  await SaleType.deleteMany({});
  const saleTypes = [
    { type: "Total Sales", sequenceNumber: 1 },
    { type: "Cash Sales", sequenceNumber: 2 },
    { type: "Credit Sales", sequenceNumber: 3 },
  ];

  await SaleType.insertMany(saleTypes);
}

// Seed warehouses
async function seedWarehouses() {
  await Warehouse.deleteMany({});
  const warehouses = [
    { name: "Phnom Penh", code: "PP" },
    { name: "Siem Reap", code: "SR" },
    { name: "Battambang", code: "BTB" },
    { name: "Kampot", code: "KPT" },
    { name: "Kep", code: "KEP" },
  ];

  await Warehouse.insertMany(warehouses);
}

// ✅ Seed order statuses
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

// Run all seeders in order
async function runSeeders() {
  await connectDB();

  try {
    await seedUsers();
    await seedSaleTypes();
    await seedWarehouses();
    await seedOrderStatuses();
    await seedDestinations();
    await seedCategoryTypes();
    await seedTransactionTypes();
  } catch (error) {
    console.error("❌ Seeding error:", error);
  } finally {
    await mongoose.disconnect();

    process.exit(0);
  }
}

// Run the seeders
runSeeders();
