import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Staff from "../../models/staffMember/staff.js";

const router = express.Router();

router.get("/mr-wise-outstanding", async (req, res) => {
  try {
    const { page = 1, limit = 7, search, startDate, endDate } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = { dueAmount: { $gt: 0 } };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          error: "Invalid date format. Please use YYYY-MM-DD format.",
        });
      }

      matchConditions.invoiceDate = {
        $gte: start,
        $lte: end,
      };
    }

    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    // Base aggregation pipeline
    const basePipeline = [
      { $match: matchConditions },

      {
        $group: {
          _id: "$mrName",
          totalOutstandingAmount: { $sum: "$dueAmount" },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },

      {
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
      },

      {
        $project: {
          mrName: "$_id",
          totalOutstandingAmount: { $round: ["$totalOutstandingAmount", 2] },
          totalCustomers: { $size: "$uniqueCustomers" },
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
      },

      { $sort: { totalOutstandingAmount: -1 } },
    ];

    const [countResult, mrData, summaryResult] = await Promise.all([
      SaleSummary.aggregate([...basePipeline, { $count: "totalCount" }]),
      
      SaleSummary.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: limitNum },
      ]),
      
      SaleSummary.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: "$mrName",
            totalOutstandingAmount: { $sum: "$dueAmount" },
            uniqueCustomers: { $addToSet: "$customerCode" },
          },
        },
        {
          $group: {
            _id: null,
            totalOutstandingAmount: {
              $sum: { $round: ["$totalOutstandingAmount", 2] },
            },
            totalCustomers: { $sum: { $size: "$uniqueCustomers" } },
            totalMRs: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    const records = mrData.map((mr, index) => ({
      mrId: `MR${String(skip + index + 1).padStart(3, "0")}`,
      mrName: mr.mrName,
      totalOutstandingAmount: mr.totalOutstandingAmount,
      totalCustomers: mr.totalCustomers,
      staff: mr.staff,
    }));

    const summary = summaryResult[0] || {
      totalOutstandingAmount: 0,
      totalCustomers: 0,
      totalMRs: 0,
    };

    res.json({
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
  } catch (err) {
    console.error("Error in /mr-wise-outstanding:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

export default router;