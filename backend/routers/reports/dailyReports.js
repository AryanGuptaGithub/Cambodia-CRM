import express from "express";

import SaleSummary from "../../models/sale/saleSummary.js";
import SaleType from "../../models/reports/saleType.js";
const router = express();
router.get("/dailyReports", async (req, res) => {
  try {
    console.log("➡️ Received request for /dailyReports");

    const { saleType, startDate, endDate, tab } = req.query;
    console.log("Query params:", { saleType, startDate, endDate, tab });

    const matchStage = {};
    console.log("Initial matchStage:", matchStage);

    if (saleType === "Cash Sales" || saleType === "Credit Sales") {
      matchStage.saleType = saleType;
      console.log("Added saleType to matchStage:", matchStage);
    }

    // Helper to validate date
    const isValidDate = (d) => d instanceof Date && !isNaN(d);

    if (tab.toLowerCase() === "single" && !startDate && !endDate) {
      console.log(
        "Tab is 'single' and no startDate/endDate provided. Fetching latest recording date..."
      );

      const latestRecord = await SaleSummary.findOne({})
        .sort({ recordingDate: -1 })
        .select("recordingDate")
        .lean();

      console.log("Latest record found:", latestRecord);

      if (latestRecord && latestRecord.recordingDate) {
        const lastDate = new Date(latestRecord.recordingDate);
        lastDate.setHours(0, 0, 0, 0);
        console.log("LastDate (start of day):", lastDate);

        const lastDateEnd = new Date(latestRecord.recordingDate);
        lastDateEnd.setHours(23, 59, 59, 999);
        console.log("LastDateEnd (end of day):", lastDateEnd);

        matchStage.recordingDate = {
          $gte: lastDate,
          $lte: lastDateEnd,
        };
        console.log(
          "Updated matchStage with recordingDate range:",
          matchStage.recordingDate
        );
      } else {
        console.log("No latest record found or no recordingDate present.");
      }
    } else if (startDate || endDate) {
      console.log("StartDate or EndDate provided. Using given date filters.");
      matchStage.recordingDate = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isValidDate(start)) {
          matchStage.recordingDate.$gte = start;
          console.log("Set matchStage.recordingDate.$gte:", start);
        } else {
          console.warn("Invalid startDate provided, ignoring:", startDate);
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (isValidDate(end)) {
          end.setHours(23, 59, 59, 999);
          matchStage.recordingDate.$lte = end;
          console.log("Set matchStage.recordingDate.$lte:", end);
        } else {
          console.warn("Invalid endDate provided, ignoring:", endDate);
        }
      }
      console.log(
        "Updated matchStage with recordingDate:",
        matchStage.recordingDate
      );
    } else {
      console.log("No date filtering applied.");
    }

    // Build aggregation pipeline
    const pipeline = [];
    console.log("Building aggregation pipeline...");

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
      console.log("Added $match stage:", matchStage);
    } else {
      console.log("No $match stage added, matchStage is empty.");
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
    console.log("Added $group stage.");

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
    console.log("Added $project stage.");

    const summaryByMrName = await SaleSummary.aggregate(pipeline);
    console.log("Aggregation result (summaryByMrName):", summaryByMrName);

    // Compute date range for results
    const dateRangePipeline = [];
    if (Object.keys(matchStage).length > 0) {
      dateRangePipeline.push({ $match: matchStage });
      console.log("Added $match stage to dateRangePipeline:", matchStage);
    }

    dateRangePipeline.push({
      $group: {
        _id: null,
        minRecordingDate: { $min: "$recordingDate" },
        maxRecordingDate: { $max: "$recordingDate" },
      },
    });
    console.log("Added $group stage to dateRangePipeline for min/max dates.");

    const dateRangeResult = await SaleSummary.aggregate(dateRangePipeline);
    console.log("Date range aggregation result:", dateRangeResult);

    const dateRange = dateRangeResult[0] || {
      minRecordingDate: null,
      maxRecordingDate: null,
    };
    console.log("Final dateRange to return:", dateRange);

    res.status(200).json({
      reports: summaryByMrName,
      dateRange,
    });
    console.log("Response sent successfully.");
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
