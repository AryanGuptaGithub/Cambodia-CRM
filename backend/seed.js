// seed.js
import mongoose from "mongoose";
import User from "./models/User.js";
import dotenv from "dotenv";
import SaleType from "./models/reports/saleType.js";
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;


async function connectDB(uri) {
  try {
    await mongoose.connect(uri); // no need for useNewUrlParser or useUnifiedTopology
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

// Seed function
async function seedUsers() {
  await connectDB(MONGO_URI);

  try {
    await User.deleteMany({});
    const users = [
      { username: "superadmin", password: "123456", role: "super-admin" },
      { username: "admin", password: "123456", role: "admin" },
    ];

    for (const u of users) {
      const user = new User(u);
      await user.save();
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  }
}

async function seedSaleTypes() {
  try {
    await connectDB(uri);

    const saleTypes = [
      {
        type: "Total Sales",
        sequenceNumber: 1,
      },
      {
        type: "Cash Sales",
        sequenceNumber: 2,
      },
      {
        type: "Credit Sales",
        sequenceNumber: 3,
      },
    ];

    const result = await SaleType.insertMany(saleTypes);
    
  } catch (err) {
    console.error("❌ Error inserting SaleTypes:", err);
  } finally {
    mongoose.disconnect(); // ✅ clean shutdown
  }
}

seedSaleTypes();
seedUsers();
