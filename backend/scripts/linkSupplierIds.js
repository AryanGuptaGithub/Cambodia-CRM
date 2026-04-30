import mongoose from "mongoose";
import dotenv from "dotenv";

import PurchaseInventory from "../models/purcharsing/purchaseInventory.js";
import Supplier from "../models/master/supplier.js";

dotenv.config();

const runMigration = async () => {
  try {
    console.log("🚀 Starting supplier migration...");

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ DB connected");

    // ─────────────────────────────
    // Load suppliers
    // ─────────────────────────────
    const suppliers = await Supplier.find({}).lean();
    console.log("📦 Suppliers loaded:", suppliers.length);

    const supplierMap = new Map(
      suppliers.map((s) => [
        s.name.toLowerCase().trim(),
        s._id,
      ])
    );

    // ─────────────────────────────
    // Find unmapped purchases
    // ─────────────────────────────
    const purchases = await PurchaseInventory.find({
      supplierId: null,
    });

    console.log("🧾 Purchases to update:", purchases.length);

    let linked = 0;
    let notFound = 0;

    for (const inv of purchases) {
      const key = (inv.supplierName || "")
        .toLowerCase()
        .trim();

      if (!key) {
        console.log("⚠ Missing supplierName:", inv._id);
        continue;
      }

      const supplierId = supplierMap.get(key);

      if (supplierId) {
        await PurchaseInventory.updateOne(
          { _id: inv._id },
          { $set: { supplierId } }
        );

        linked++;
        console.log(`✅ Linked: ${inv.supplierName}`);
      } else {
        notFound++;
        console.log(`❌ Not found: ${inv.supplierName}`);
      }
    }

    // ─────────────────────────────
    // Summary
    // ─────────────────────────────
    console.log("\n======================");
    console.log("✅ MIGRATION COMPLETE");
    console.log("======================");
    console.log("📦 Linked:", linked);
    console.log("⚠️ Not found:", notFound);

    await mongoose.disconnect();
    console.log("🔌 DB disconnected");
  } catch (err) {
    console.error("❌ Migration error:", err);
    process.exit(1);
  }
};

runMigration();