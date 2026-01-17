import dotenv from "dotenv";
import mongoose from "mongoose";
import StockAdjustment from "./models/stock/stockAdjustment.js";
dotenv.config();

// MongoDB connection
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}

async function seed() {
  await connectDB();

  const data = [
    {
      _id: "6964c6ff6480aba37f7d8624",
      productId: "6964c1e96480aba37f7d7956",
      boxQuantity: 1337,
      totalQuantity: 1337,
      adjustmentType: "add",
      remarks: "test",
      createdAt: "2026-01-12T10:03:43.447+00:00",
      updatedAt: "2026-01-12T10:03:43.447+00:00",
      __v: 0,
    },
    {
      _id: "6964c7146480aba37f7d8631",
      productId: "6964c1e96480aba37f7d793b",
      boxQuantity: 1206,
      totalQuantity: 1206,
      adjustmentType: "add",
      remarks: "test",
      createdAt: "2026-01-12T10:04:04.912+00:00",
      updatedAt: "2026-01-12T10:04:04.912+00:00",
      __v: 0,
    },
    {
      _id: "6964c7266480aba37f7d8640",
      productId: "6964c1e96480aba37f7d7965",
      boxQuantity: 805,
      totalQuantity: 805,
      adjustmentType: "add",
      remarks: "test",
      createdAt: "2026-01-12T10:04:22.929+00:00",
      updatedAt: "2026-01-12T10:04:22.929+00:00",
      __v: 0,
    },
    {
      _id: "6964c7336480aba37f7d864f",
      productId: "6964c1e96480aba37f7d796b",
      boxQuantity: 607,
      totalQuantity: 607,
      adjustmentType: "add",
      remarks: "test",
      createdAt: "2026-01-12T10:04:35.162+00:00",
      updatedAt: "2026-01-12T10:04:35.162+00:00",
      __v: 0,
    },
    {
      _id: "6964c7566480aba37f7d865c",
      productId: "6964c1e96480aba37f7d795c",
      boxQuantity: 437,
      totalQuantity: 437,
      adjustmentType: "add",
      remarks: "test",
      createdAt: "2026-01-12T10:05:10.906+00:00",
      updatedAt: "2026-01-12T10:05:10.906+00:00",
      __v: 0,
    },
  ];

  try {
    await StockAdjustment.insertMany(data);
    console.log("✅ Stock adjustments seeded successfully!");
  } catch (err) {
    console.error("❌ Error inserting seed data:", err);
  } finally {
    mongoose.connection.close();
    console.log("🔌 MongoDB connection closed");
  }
}

seed();

