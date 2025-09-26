// routes/dailySummary.js (example path)

import express from "express";
import mongoose from "mongoose";
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
      message: `Successfully imported ${
        result.nUpserted + result.nModified
      } daily summary records.`,
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

router.put("/dailysummary/:summaryId/:productId", async (req, res) => {
  try {
    const { summaryId, productId } = req.params;

    const {
      productName,
      salesQuantity,
      bonusQuantity,
      totalQuantity,
      value,
      date,
    } = req.body;

    // Validate fields (optional but recommended)
    if (!summaryId || !productId) {
      return res
        .status(400)
        .json({ message: "Missing summaryId or productId" });
    }

    const updatedReport = await DailySummary.findOneAndUpdate(
      { _id: summaryId, "products._id": productId },
      {
        $set: {
          "products.$.productName": productName,
          "products.$.salesQuantity": salesQuantity,
          "products.$.bonusQuantity": bonusQuantity,
          "products.$.totalQuantity": totalQuantity,
          "products.$.value": value,
          "products.$.date": date,
        },
      },
      { new: true } // Return the updated document
    );

    if (!updatedReport) {
      return res.status(404).json({ message: "Product or Summary not found" });
    }

    res.status(200).json(updatedReport);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: "Server error updating report" });
  }
});

// DELETE /api/dailysummary/:summaryId/:productId
router.delete("/dailysummary/:summaryId/:productId", async (req, res) => {
  try {
    const { summaryId, productId } = req.params;

    if (!summaryId || !productId) {
      return res
        .status(400)
        .json({ message: "Missing summaryId or productId" });
    }

    // Find and update the DailySummary document by pulling the product from array
    const updatedSummary = await DailySummary.findByIdAndUpdate(
      summaryId,
      {
        $pull: { products: { _id: productId } },
      },
      { new: true }
    );

    if (!updatedSummary) {
      return res.status(404).json({ message: "Summary or product not found" });
    }

    res.status(200).json({
      message: "Product deleted from summary successfully",
      data: updatedSummary,
    });
  } catch (error) {
    console.error("Delete product from summary error:", error);
    res.status(500).json({ message: "Server error while deleting product" });
  }
});

router.delete("/dailysummary", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "No data provided for deletion." });
  }

  try {
    const groupedBySummaryId = {};

    ids.forEach(({ id, saleSummaryId }) => {
      if (
        mongoose.Types.ObjectId.isValid(id) &&
        mongoose.Types.ObjectId.isValid(saleSummaryId)
      ) {
        if (!groupedBySummaryId[saleSummaryId]) {
          groupedBySummaryId[saleSummaryId] = [];
        }
        groupedBySummaryId[saleSummaryId].push(id);
      }
    });

    const summaryIds = Object.keys(groupedBySummaryId);

    if (summaryIds.length === 0) {
      return res.status(400).json({ error: "No valid IDs provided." });
    }

    for (const summaryId of summaryIds) {
      const productIds = groupedBySummaryId[summaryId];

      await DailySummary.updateOne(
        { _id: summaryId },
        {
          $pull: {
            products: {
              _id: { $in: productIds },
            },
          },
        }
      );
    }

    res.status(200).json({ message: `Selected <b>${ids.length}</b> daily summary reports deleted.` });
  } catch (error) {
    console.error("Deletion error:", error);
    res.status(500).json({ error: "Failed to delete product entries." });
  }
});

router.get("/dailysummary/byDate", async (req, res) => {
  try {
    const { start, end } = req.query;

    // Validate dates
    if (!start || !end) {
      return res.status(400).json({ message: "Missing start or end date." });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate) || isNaN(endDate)) {
      return res.status(400).json({ message: "Invalid date format." });
    }

    endDate.setHours(23, 59, 59, 999);
    const summaries = await DailySummary.find({
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    }).sort({ date: -1 });
    console.log('values of su', summaries);
    res.status(200).json(summaries);
  } catch (err) {
    console.error("Error fetching daily summaries by date:", err);
    res.status(500).json({ message: "Failed to fetch daily summaries." });
  }
});

export default router;
