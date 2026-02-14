import express from "express";
import mongoose from "mongoose";
import Product from "../../models/projectManger/product.js";
import { DailySummary } from "../../models/reports/dailysummary.js";

const router = express.Router();


router.get("/unique-names", async (req, res) => {
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

router.post("/import", async (req, res) => {
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

router.get("/", async (req, res) => {
  try {
    const summaries = await DailySummary.find().sort({ date: -1 });
    res.status(200).json(summaries);
  } catch (err) {
    console.error("Error fetching daily summaries:", err);
    res.status(500).json({ message: "Failed to fetch daily summaries." });
  }
});

router.get("/byDate", async (req, res) => {
  try {
    const { start, end } = req.query;

    const matchStage = {};

    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);

      if (isNaN(startDate) || isNaN(endDate)) {
        return res.status(400).json({ message: "Invalid date format." });
      }

      matchStage.date = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    const results = await DailySummary.aggregate([
      { $match: matchStage },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.productName",
          salesQuantity: { $sum: "$products.salesQuantity" },
          bonusQuantity: { $sum: "$products.bonusQuantity" },
          totalQuantity: { $sum: "$products.totalQuantity" },
          amount: { $sum: "$products.value" },
          totalDayQuantity: { $max: "$totalDayQuantity" },
        },
      },
      {
        $project: {
          _id: 0,
          productName: "$_id",
          salesQuantity: 1,
          bonusQuantity: 1,
          totalQuantity: 1,
          amount: 1,
          totalDayQuantity: 1,
        },
      },
      { $sort: { productName: 1 } },
    ]);

    res.status(200).json(results);
  } catch (err) {
    console.error("Error fetching aggregated daily summaries:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch aggregated daily summaries." });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      date,
      productName,
      salesQuantity,
      bonusQuantity,
      totalQty,
      amount,
    } = req.body;

    if (!date || !productName) {
      return res
        .status(400)
        .json({ message: "Date and product name are required." });
    }

    const parsedDate = new Date(date);

    // Find existing document for the date
    const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));

    let summaryDoc = await DailySummary.findOne({
      date: { $gte: startOfDay, $lte: endOfDay },
    });

    if (!summaryDoc) {
      // Create new document
      const newDoc = new DailySummary({
        date: new Date(date),
        totalDayQuantity: totalQty,
        products: [
          {
            productName,
            salesQuantity,
            bonusQuantity,
            totalQuantity: totalQty,
            value: amount,
          },
        ],
      });

      const saved = await newDoc.save();
      return res.status(201).json({
        message: "New daily summary created.",
        data: saved,
      });
    }

    // Check if product already exists
    const productIndex = summaryDoc.products.findIndex(
      (p) => p.productName === productName
    );

    if (productIndex !== -1) {
      // Update existing product
      summaryDoc.products[productIndex].salesQuantity = salesQuantity;
      summaryDoc.products[productIndex].bonusQuantity = bonusQuantity;
      summaryDoc.products[productIndex].totalQuantity = totalQty;
      summaryDoc.products[productIndex].value = amount;
    } else {
      // Add new product
      summaryDoc.products.push({
        productName,
        salesQuantity,
        bonusQuantity,
        totalQuantity: totalQty,
        value: amount,
      });
    }

    // Update totalDayQuantity
    summaryDoc.totalDayQuantity = summaryDoc.products.reduce(
      (sum, p) => sum + (p.totalQuantity || 0),
      0
    );

    const updated = await summaryDoc.save();

    return res.status(200).json({
      message:
        productIndex !== -1
          ? "Product updated in daily summary."
          : "Product added to existing daily summary.",
      data: updated,
    });
  } catch (err) {
    console.error("Error in POST:", err);
    return res.status(500).json({
      message: "Server error while saving daily summary.",
    });
  }
});

router.put("/:summaryId/:productId", async (req, res) => {
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
      { new: true }
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

router.delete("/:summaryId/:productId", async (req, res) => {
  try {
    const { summaryId, productId } = req.params;

    if (!summaryId || !productId) {
      return res
        .status(400)
        .json({ message: "Missing summaryId or productId" });
    }

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

router.delete("/", async (req, res) => {
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

    res.status(200).json({
      message: `Selected <b>${ids.length}</b> daily summary reports deleted.`,
    });
  } catch (error) {
    console.error("Deletion error:", error);
    res.status(500).json({ error: "Failed to delete product entries." });
  }
});

export default router;
