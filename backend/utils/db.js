// utils/db.js
import mongoose from "mongoose";
import PaymentStatusType from "../models/paymentStatus.js";
import SaleType from "../models/reports/saleType.js";

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
   
    // Check if already seeded (prevent duplicates)
    const existing = await SaleType.countDocuments();
    if (existing > 0) {
      return;
    }

    const saleTypes = [
      { type: "Total Sales", sequenceNumber: 1 },
      { type: "Cash Sales", sequenceNumber: 2 },
      { type: "Credit Sales", sequenceNumber: 3 },
    ];

    const result = await SaleType.insertMany(saleTypes);
  } catch (err) {
    console.error("❌ Error inserting SaleTypes:", err);
  }
}

export async function seedPaymentStatuses() {
  try {

    // Check if already seeded (prevent duplicates)
    const existing = await PaymentStatusType.countDocuments();
    if (existing > 0) {
      return;
    }

    const paymentStatuses = [
      { type: "Cash" },
      { type: "Credit" },
      { type: "Partial Paid" },
    ];

    const result = await PaymentStatusType.insertMany(paymentStatuses);
  } catch (err) {
    console.error("❌ Error inserting PaymentStatuses:", err);
  }
}

export default connectDB;
