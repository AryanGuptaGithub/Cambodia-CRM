import mongoose from "mongoose";
import dotenv from "dotenv";

import PurchaseInventory from "../models/purchasing/purchaseInventory.js";
import SaleSummary from "../models/sale/saleSummary.js";
import Product from "../models/projectManager/product.js";

dotenv.config();

/* ─────────────────────────────────────────────
   Helpers
──────────────────────────────────────────── */

const normalize = (name = "") =>
  name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");

const findBestMatch = (name, products) => {
  const clean = normalize(name);

  return (
    products.find(
      (p) => normalize(p.productName) === clean
    ) ||
    products.find(
      (p) =>
        normalize(p.productName).includes(clean) ||
        clean.includes(normalize(p.productName))
    )
  );
};

/* ─────────────────────────────────────────────
   MAIN
──────────────────────────────────────────── */

const runMigration = async () => {
  try {
    console.log("🚀 Starting migration...");

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ DB connected");

    /* ───────── PRODUCTS ───────── */

    const products = await Product.find({}).lean();
    console.log("📦 Products loaded:", products.length);

    const productMap = new Map(
      products.map((p) => [
        normalize(p.productName),
        p._id,
      ])
    );

    console.log("🧠 Product map created");

    /* ───────── PURCHASES ───────── */

    const purchases = await PurchaseInventory.find({}).lean();
    console.log("🧾 Purchases loaded:", purchases.length);

    let pLinked = 0;
    let pUnmatched = 0;

    if (!purchases.length) {
      console.log("⚠️ No purchases found in DB");
    }

    for (const inv of purchases) {
      console.log("\n────────────────────────────");
      console.log("📄 Processing Purchase ID:", inv._id);

      const items =
        inv.products ||
        inv.items ||
        inv.productItems ||
        [];

      console.log("📦 Items found:", items.length);

      if (!items.length) {
        console.log("❌ No product items in this purchase");
        continue;
      }

      for (const p of items) {
        const name =
          p.productName ||
          p.name ||
          p.product?.productName;

        if (!name) {
          console.log("⚠️ Missing product name in item:", p);
          continue;
        }

        let id = productMap.get(normalize(name));

        if (!id) {
          const match = findBestMatch(name, products);
          id = match?._id;
        }

        if (id) {
          p.productId = id;
          pLinked++;
          console.log("✅ Linked:", name);
        } else {
          pUnmatched++;
          console.log("❌ No match:", name);
        }
      }

      // NOTE: remove lean effect for saving
      await PurchaseInventory.updateOne(
        { _id: inv._id },
        { $set: { products: items } }
      );
    }

    /* ───────── SALES ───────── */

    const sales = await SaleSummary.find({}).lean();
    console.log("\n🧾 Sales loaded:", sales.length);

    let sLinked = 0;
    let sUnmatched = 0;

    for (const sale of sales) {
      console.log("\n────────────────────────────");
      console.log("📄 Processing Sale ID:", sale._id);

      const items =
        sale.products ||
        sale.items ||
        sale.productItems ||
        [];

      console.log("📦 Items found:", items.length);

      if (!items.length) {
        console.log("❌ No product items in this sale");
        continue;
      }

      for (const p of items) {
        const name =
          p.productName ||
          p.name ||
          p.product?.productName;

        if (!name) {
          console.log("⚠️ Missing product name:", p);
          continue;
        }

        let id = productMap.get(normalize(name));

        if (!id) {
          const match = findBestMatch(name, products);
          id = match?._id;
        }

        if (id) {
          p.productId = id;
          sLinked++;
          console.log("✅ Linked:", name);
        } else {
          sUnmatched++;
          console.log("❌ No match:", name);
        }
      }

      await SaleSummary.updateOne(
        { _id: sale._id },
        { $set: { products: items } }
      );
    }

    /* ───────── SUMMARY ───────── */

    console.log("\n========================");
    console.log("✅ MIGRATION COMPLETE");
    console.log("========================");

    console.log("📦 Purchase linked:", pLinked);
    console.log("📦 Purchase unmatched:", pUnmatched);

    console.log("📦 Sale linked:", sLinked);
    console.log("📦 Sale unmatched:", sUnmatched);

    await mongoose.disconnect();
    console.log("🔌 DB disconnected");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
};

runMigration();