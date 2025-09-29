// utils/db.js
import mongoose from "mongoose";
import SaleType from "../models/reports/saleType.js";
import PaymentStatusType from "../models/paymentStatus.js";

mongoose.set("bufferTimeoutMS", 30000); // Optional

let isConnected = false;

async function connectDB(uri) {
  if (isConnected) {
    return mongoose.connection;
  }

  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    isConnected = true;
    console.log("✅ MongoDB connected");

    // Call seed function ONCE after successful connection
    await seedSaleTypes();
    await seedPaymentStatuses();

    return mongoose.connection;
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    throw err;
  }
}

async function seedSaleTypes() {
  try {
    console.log("🌱 Seeding SaleTypes...");

    // Check if already seeded (prevent duplicates)
    const existing = await SaleType.countDocuments();
    if (existing > 0) {
      console.log("⚠️ SaleTypes already seeded. Skipping...");
      return;
    }

    const saleTypes = [
      { type: "Total Sales", sequenceNumber: 1 },
      { type: "Cash Sales", sequenceNumber: 2 },
      { type: "Credit Sales", sequenceNumber: 3 },
    ];

    const result = await SaleType.insertMany(saleTypes);
    console.log("✅ Inserted SaleTypes:", result);
  } catch (err) {
    console.error("❌ Error inserting SaleTypes:", err);
  }
}

export async function seedPaymentStatuses() {
  try {
    console.log("🌱 Seeding PaymentStatuses...");

    // Check if already seeded (prevent duplicates)
    const existing = await PaymentStatusType.countDocuments();
    if (existing > 0) {
      console.log("⚠️ PaymentStatuses already seeded. Skipping...");
      return;
    }

    const paymentStatuses = [
      { type: "Cash" },
      { type: "Credit" },
      { type: "Partial Paid" },
    ];

    const result = await PaymentStatusType.insertMany(paymentStatuses);
    console.log("✅ Inserted PaymentStatuses:", result);
  } catch (err) {
    console.error("❌ Error inserting PaymentStatuses:", err);
  }
}

export default connectDB;
