import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import SaleType from "../../models/reports/saleType.js";

const router = express.Router();

router.get("/dailyReports", async (req, res) => {
  try {
    const {
      saleType,
      startDate,
      endDate,
      dateFilter,
      search,
      page = 1,
      limit = 7,
    } = req.query;

 

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    // Build match conditions separately
    const paymentStatusMatch = {};
    const dateMatch = {};
    const searchMatch = {};

    // 1. First: Payment Status Condition based on active sale type tab
    if (saleType && saleType !== "Total sales") {
      if (saleType.toLowerCase().includes("cash")) {
        paymentStatusMatch.paymentStatus = "Cash";
      } else if (saleType.toLowerCase().includes("credit")) {
        paymentStatusMatch.paymentStatus = "Credit";
      }
    }

    // 2. Second: Search Condition
    if (search?.trim()) {
      searchMatch.mrName = { $regex: search.trim(), $options: "i" };
    }

    // 3. Third: Date Condition based on active date tab
    const isValidDate = (d) => d instanceof Date && !isNaN(d);

    if (dateFilter && dateFilter !== "all") {
      let start, end;
      const today = new Date();

      switch (dateFilter) {
        case "today":
          start = new Date(today);
          end = new Date(today);
          break;

        case "currentMonth":
          start = new Date(today.getFullYear(), today.getMonth(), 1);
          end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          break;

        case "janToPreviousMonth":
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth();
          if (currentMonth === 0) {
            // If current month is January, show previous year
            start = new Date(currentYear - 1, 0, 1);
            end = new Date(currentYear - 1, 11, 31);
          } else {
            start = new Date(currentYear, 0, 1);
            end = new Date(currentYear, currentMonth - 1, 0);
          }
          break;

        case "custom":
          // Use provided startDate and endDate from custom filter
          if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
          }
          break;

        default:
          break;
      }

      // Apply date filter if dates are valid
      if (start && end && isValidDate(start) && isValidDate(end)) {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        dateMatch.deliveryDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    // Combine all match conditions
    const matchStage = {
      ...paymentStatusMatch,
      ...dateMatch,
      ...searchMatch,
    };

 

    // Base aggregation pipeline for MR-wise grouping
    const basePipeline = [];

    // Apply the combined match stage
    if (Object.keys(matchStage).length > 0) {
      basePipeline.push({ $match: matchStage });
    }

    // Group by MR name only to get total sums for each MR
    basePipeline.push({
      $group: {
        _id: "$mrName", // Group only by MR name, not by date
        totalSalesAmount: { $sum: "$netSellingAmount" },
        totalOrders: { $sum: 1 },
        totalPaidAmount: { $sum: "$paidAmount" },
        totalDueAmount: { $sum: "$dueAmount" },
        totalSalesQty: { $sum: "$salesQty" },
        totalBonusQty: { $sum: "$bonusQty" },
        totalQty: { $sum: "$totalQty" },
        // Categorize based on paymentStatus
        credits: {
          $sum: {
            $cond: [
              { $eq: ["$paymentStatus", "Credit"] },
              "$netSellingAmount",
              0,
            ],
          },
        },
        cash: {
          $sum: {
            $cond: [
              { $eq: ["$paymentStatus", "Cash"] },
              "$netSellingAmount",
              0,
            ],
          },
        },
        uniqueCustomers: { $addToSet: "$customerCode" },
        // Get the latest date for this MR within the filtered period
        latestDate: { $max: "$deliveryDate" },
        // Get the earliest date for this MR within the filtered period
        earliestDate: { $min: "$deliveryDate" },
      },
    });

    // Lookup staff details
    basePipeline.push({
      $lookup: {
        from: "staffs",
        let: { mrName: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$medicalRepName", "$$mrName"] },
                  { $eq: ["$enabled", true] },
                ],
              },
            },
          },
          {
            $project: {
              medicalRepName: 1,
              teamName: 1,
              contactNo: 1,
              email: 1,
            },
          },
        ],
        as: "staffDetails",
      },
    });

    // Format output
    basePipeline.push({
      $project: {
        _id: 0,
        mrName: "$_id",
        totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
        totalOrders: 1,
        totalPaidAmount: { $round: ["$totalPaidAmount", 2] },
        totalDueAmount: { $round: ["$totalDueAmount", 2] },
        totalSalesQty: 1,
        totalBonusQty: 1,
        totalQty: 1,
        credits: { $round: ["$credits", 2] },
        cash: { $round: ["$cash", 2] },
        totalCustomers: { $size: "$uniqueCustomers" },
        // Show date range for the MR's activity
        dateRange: {
          $cond: {
            if: { $eq: ["$earliestDate", "$latestDate"] },
            then: {
              $dateToString: { format: "%Y-%m-%d", date: "$latestDate" },
            },
            else: {
              $concat: [
                {
                  $dateToString: { format: "%Y-%m-%d", date: "$earliestDate" },
                },
                " to ",
                { $dateToString: { format: "%Y-%m-%d", date: "$latestDate" } },
              ],
            },
          },
        },
        latestDate: {
          $dateToString: { format: "%Y-%m-%d", date: "$latestDate" },
        },
        staff: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: { $arrayElemAt: ["$staffDetails", 0] },
            else: {
              medicalRepName: "$_id",
              contactNo: "Not Available",
              email: "Not Available",
              teamName: "Not Available",
            },
          },
        },
      },
    });

    basePipeline.push({ $sort: { totalSalesAmount: -1 } });

    // Execute pipelines in parallel for pagination
    const [countResult, reportsData, summaryResult] = await Promise.all([
      // Count total records (total MRs)
      SaleSummary.aggregate([...basePipeline, { $count: "totalCount" }]),

      // Get paginated data
      SaleSummary.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: limitNum },
      ]),

      // Get summary data (across all MRs)
      SaleSummary.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalSalesAmount: { $sum: "$netSellingAmount" },
            totalOrders: { $sum: 1 },
            totalPaidAmount: { $sum: "$paidAmount" },
            totalDueAmount: { $sum: "$dueAmount" },
            // Summary also based on paymentStatus
            credits: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentStatus", "Credit"] },
                  "$netSellingAmount",
                  0,
                ],
              },
            },
            cash: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentStatus", "Cash"] },
                  "$netSellingAmount",
                  0,
                ],
              },
            },
            uniqueCustomers: { $addToSet: "$customerCode" },
            uniqueMRs: { $addToSet: "$mrName" },
          },
        },
        {
          $project: {
            _id: 0,
            totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
            totalOrders: 1,
            totalPaidAmount: { $round: ["$totalPaidAmount", 2] },
            totalDueAmount: { $round: ["$totalDueAmount", 2] },
            credits: { $round: ["$credits", 2] },
            cash: { $round: ["$cash", 2] },
            totalCustomers: { $size: "$uniqueCustomers" },
            totalMRs: { $size: "$uniqueMRs" },
          },
        },
      ]),
    ]);

    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    // Format records with sequential IDs
    const records = reportsData.map((report, index) => ({
      mrId: `MR${String(skip + index + 1).padStart(3, "0")}`,
      mrName: report.mrName,
      totalSalesAmount: report.totalSalesAmount,
      totalOrders: report.totalOrders,
      credits: report.credits,
      cash: report.cash,
      totalCustomers: report.totalCustomers,
      date: report.dateRange, // Show date range instead of single date
      latestDate: report.latestDate, // Also include latest date for sorting
      staff: report.staff,
    }));

    const summary = summaryResult[0] || {
      totalSalesAmount: 0,
      totalOrders: 0,
      totalPaidAmount: 0,
      totalDueAmount: 0,
      credits: 0,
      cash: 0,
      totalCustomers: 0,
      totalMRs: 0,
    };

    res.status(200).json({
      data: {
        summary,
        records,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching daily reports:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
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
    console.error("Error fetching sale types:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;