import express from "express";

import SaleSummary from "../../models/sale/saleSummary.js";
import SaleType from "../../models/reports/saleType.js";
const router = express();

router.get("/dailyReports", async (req, res) => {
  try {
    const { saleType, startDate, endDate } = req.query;
    const matchStage = {};

    if (saleType === "Cash Sales" || saleType === "Credit Sales") {
      matchStage.saleType = saleType;
    }

    if (startDate || endDate) {
      matchStage.recordingDate = {};
      if (startDate) {
        matchStage.recordingDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchStage.recordingDate.$lte = end;
      }
    }

    const pipeline = [];

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }
    pipeline.push({
      $group: {
        _id: {
          mrName: "$mrName",
          saleType: "$saleType",
        },
        totalPaidAmount: { $sum: "$paidAmount" },
        totalDueAmount: { $sum: "$dueAmount" },
        totalSalesQty: { $sum: "$salesQty" },
        totalBonusQty: { $sum: "$bonusQty" },
        totalQty: { $sum: "$totalQty" },
      },
    });

    pipeline.push({
      $project: {
        _id: 0,
        mrName: "$_id.mrName",
        saleType: "$_id.saleType",
        totalPaidAmount: 1,
        totalDueAmount: 1,
        totalSalesQty: 1,
        totalBonusQty: 1,
        totalQty: 1,
      },
    });

    const summaryByMrName = await SaleSummary.aggregate(pipeline);
    res.status(200).json(summaryByMrName);
  } catch (error) {
    console.error("❌ Error fetching summary by mrName:", error);
    res.status(500).json({ message: "Failed to fetch summary." });
  }
});

router.get("/dailyReports/types", async (req, res) => {
  try {
    const types = await SaleType.find({}, { type: 1, _id: 0 });
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
