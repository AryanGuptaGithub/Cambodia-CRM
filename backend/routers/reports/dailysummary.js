// routes/dailySummary.js (example path)

import express from "express";
import Product from "../../models/projectManger/product.js";
import { DailySummary } from "../../models/reports/dailysummary.js";

const router = express.Router();

router.get("/dailysummary/unique-names", async (req, res) => {
  try {
    const uniqueNames = await Product.distinct("productName", {
      productName: { $ne: null },
    });

    uniqueNames.sort((a, b) => a.localeCompare(b));

    res.status(200).json({ productNames: uniqueNames });
  } catch (error) {
    console.error("Error fetching unique product names:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/dailysummary/import", async (req, res) => {
  try {
    const dailySummaries = req.body;

    if (!Array.isArray(dailySummaries) || dailySummaries.length === 0) {
      return res.status(400).json({ message: "No data provided for import." });
    }

    const bulkOps = [];

    for (const summary of dailySummaries) {
      const { date, products, totalDayQuantity } = summary;

      // Skip if no products or invalid date
      if (!date || !Array.isArray(products) || products.length === 0) {
        continue;
      }

      // Prepare upsert operation
      bulkOps.push({
        updateOne: {
          filter: { date: new Date(date) },
          update: {
            $set: {
              date: new Date(date),
              products,
              totalDayQuantity,
            },
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length === 0) {
      return res.status(400).json({
        message: "No valid data to import. All rows may be empty or malformed.",
      });
    }

    const result = await DailySummary.bulkWrite(bulkOps);

    return res.status(200).json({
      message: `Successfully imported ${result.nUpserted + result.nModified} daily summary records.`,
    });
  } catch (err) {
    console.error("Import error:", err);
    return res.status(500).json({
      message: "Failed to import daily summary reports.",
    });
  }
});

router.get("/dailysummary", async (req, res) => {
  try {
    const summaries = await DailySummary.find().sort({ date: -1 }); 
    res.status(200).json(summaries);
  } catch (err) {
    console.error("Error fetching daily summaries:", err);
    res.status(500).json({ message: "Failed to fetch daily summaries." });
  }
});

export default router;
