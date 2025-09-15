// seed.js
import mongoose from "mongoose";
import User from "./models/User.js";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;

// MongoDB URI
// const MONGO_URI = PROCESS.ENV.MONGO_URI;

// Helper to connect to MongoDB
async function connectDB(uri) {
  try {
    await mongoose.connect(uri); // no need for useNewUrlParser or useUnifiedTopology
    console.log("✅ MongoDB connected for seeding");
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
    console.log("🧹 Users collection cleared");

    const users = [
      { username: "superadmin", password: "123456", role: "super-admin" },
      { username: "admin", password: "123456", role: "admin" },
    ];

    for (const u of users) {
      const user = new User(u);
      await user.save();
      console.log(`✅ User created: ${u.username}`);
    }

    console.log("🎉 All users seeded successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  }
}

seedUsers();
