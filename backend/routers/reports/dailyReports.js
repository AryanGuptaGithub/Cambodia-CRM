import express from "express";

import SaleSummary from "../../models/sale/saleSummary.js";
import SaleType from "../../models/reports/saleType.js";
const router = express();

router.get("/dailyReports", async (req, res) => {
  try {
    const { saleType, startDate, endDate } = req.query;
    const matchStage = {};

    // Optional filter: Sale Type
    if (saleType === "Cash Sales" || saleType === "Credit Sales") {
      matchStage.saleType = saleType;
    }

    // Optional filter: recordingDate range
    if (startDate || endDate) {
      matchStage.recordingDate = {};
      if (startDate) {
        matchStage.recordingDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // include full end day
        matchStage.recordingDate.$lte = end;
      }
    }

    // 🔹 Aggregation for grouped summary
    const summaryPipeline = [];

    if (Object.keys(matchStage).length > 0) {
      summaryPipeline.push({ $match: matchStage });
    }

    summaryPipeline.push({
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

    summaryPipeline.push({
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

    const summaryByMrName = await SaleSummary.aggregate(summaryPipeline);

    // 🔹 Aggregation for min/max recordingDate
    const dateRangePipeline = [];

    if (Object.keys(matchStage).length > 0) {
      dateRangePipeline.push({ $match: matchStage });
    }

    dateRangePipeline.push({
      $group: {
        _id: null,
        minRecordingDate: { $min: "$recordingDate" },
        maxRecordingDate: { $max: "$recordingDate" },
      },
    });

    const dateRangeResult = await SaleSummary.aggregate(dateRangePipeline);
    const dateRange = dateRangeResult[0] || {
      minRecordingDate: null,
      maxRecordingDate: null,
    };
    res.status(200).json({
      reports: summaryByMrName,
      dateRange,
    });
  } catch (error) {
    console.error("❌ Error fetching summary by mrName:", error);
    res.status(500).json({ message: "Failed to fetch summary." });
  }
});

router.get("/dailyReports/types", async (req, res) => {
  try {
    const types = await SaleType.find(
      {},
      { type: 1, sequenceNumber: 1, _id: 0 } 
    ).sort({ sequenceNumber: 1 });
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
