import express from "express";

import SaleSummary from "../../models/sale/saleSummary.js";
import SaleType from "../../models/reports/saleType.js";
const router = express();
router.get("/dailyReports", async (req, res) => {
  try {
    const { saleType, startDate, endDate, tab } = req.query;

    const matchStage = {};

    if (saleType === "Cash Sales" || saleType === "Credit Sales") {
      matchStage.saleType = saleType;
    }

    // Helper to validate date
    const isValidDate = (d) => d instanceof Date && !isNaN(d);

    if (tab.toLowerCase() === "single" && !startDate && !endDate) {
      const latestRecord = await SaleSummary.findOne({})
        .sort({ recordingDate: -1 })
        .select("recordingDate")
        .lean();
      if (latestRecord && latestRecord.recordingDate) {
        const lastDate = new Date(latestRecord.recordingDate);
        lastDate.setHours(0, 0, 0, 0);

        const lastDateEnd = new Date(latestRecord.recordingDate);
        lastDateEnd.setHours(23, 59, 59, 999);
        matchStage.recordingDate = {
          $gte: lastDate,
          $lte: lastDateEnd,
        };
      }
    } else if (startDate || endDate) {
      matchStage.recordingDate = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isValidDate(start)) {
          matchStage.recordingDate.$gte = start;
        } else {
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (isValidDate(end)) {
          end.setHours(23, 59, 59, 999);
          matchStage.recordingDate.$lte = end;
        }
      }
    }

    // Build aggregation pipeline
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

    // Compute date range for results
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
