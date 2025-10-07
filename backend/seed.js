// seed.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/User.js";
import SaleType from "./models/reports/saleType.js";
import Warehouse from "./models/stock/warehouse.js";
import OrderStatus from "./models/stock/orderStatus.js"; // ✅ Import OrderStatus model

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");
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

  console.log("✅ Users seeded successfully");
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
  console.log("✅ SaleTypes seeded successfully");
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
  console.log("✅ Warehouses seeded successfully");
}

// ✅ Seed order statuses
async function seedOrderStatuses() {
  await OrderStatus.deleteMany({});
  const orderStatuses = [
    { 
      name: "Draft", 
      code: "draft", 
      description: "Initial draft state of the order" 
    },
    { 
      name: "Confirmed", 
      code: "confirmed", 
      description: "Order has been confirmed and approved" 
    },
    { 
      name: "Shipped", 
      code: "shipped", 
      description: "Items have been shipped to destination" 
    },
    { 
      name: "Delivered", 
      code: "delivered", 
      description: "Items have been successfully delivered" 
    },
  ];

  await OrderStatus.insertMany(orderStatuses);
  console.log("✅ OrderStatuses seeded successfully");
}

// Run all seeders in order
async function runSeeders() {
  await connectDB();

  try {
    await seedUsers();
    await seedSaleTypes();
    await seedWarehouses();
    await seedOrderStatuses(); // ✅ Add order statuses seeding
    console.log("✅ All data seeded successfully");
  } catch (error) {
    console.error("❌ Seeding error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 MongoDB disconnected");
    process.exit(0);
  }
}

// Run the seeders
runSeeders();