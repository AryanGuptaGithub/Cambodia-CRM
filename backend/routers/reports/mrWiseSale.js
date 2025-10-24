import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
const router = express.Router();

router.get("/mr-wise-sales", async (req, res) => {
  try {
    const { page = 1, limit = 7, search, startDate, endDate } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = {};

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

    // Base aggregation pipeline for all sales
    const basePipeline = [
      { $match: matchConditions },

      // Group by MR to get sales summary
      {
        $group: {
          _id: "$mrName",
          totalSalesAmount: { $sum: "$netSellingAmount" }, // Use netSellingAmount for total sales
          totalOrders: { $sum: 1 }, // Count each document as an order
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },

      // Calculate average order value
      {
        $addFields: {
          averageOrderValue: {
            $round: [{ $divide: ["$totalSalesAmount", "$totalOrders"] }, 2]
          }
        }
      },

      // Lookup staff details
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

      // Format output
      {
        $project: {
          mrName: "$_id",
          totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
          totalOrders: 1,
          averageOrderValue: 1,
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

      { $sort: { totalSalesAmount: -1 } }, // Sort by sales amount descending
    ];

    const [countResult, mrData, summaryResult] = await Promise.all([
      // Count total records
      SaleSummary.aggregate([...basePipeline, { $count: "totalCount" }]),
      
      // Get paginated data
      SaleSummary.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: limitNum },
      ]),
      
      // Get summary data
      SaleSummary.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: "$mrName",
            totalSalesAmount: { $sum: "$netSellingAmount" },
            totalOrders: { $sum: 1 },
            uniqueCustomers: { $addToSet: "$customerCode" },
          },
        },
        {
          $group: {
            _id: null,
            totalSalesAmount: { $sum: { $round: ["$totalSalesAmount", 2] } },
            totalOrders: { $sum: "$totalOrders" },
            totalCustomers: { $sum: { $size: "$uniqueCustomers" } },
            totalMRs: { $sum: 1 },
          },
        },
        {
          $addFields: {
            averageOrderValue: {
              $round: [{ $divide: ["$totalSalesAmount", "$totalOrders"] }, 2]
            }
          }
        }
      ]),
    ]);

    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    // Format records with sequential IDs
    const records = mrData.map((mr, index) => ({
      mrId: `MR${String(skip + index + 1).padStart(3, "0")}`,
      mrName: mr.mrName,
      totalSalesAmount: mr.totalSalesAmount,
      totalOrders: mr.totalOrders,
      averageOrderValue: mr.averageOrderValue,
      totalCustomers: mr.totalCustomers,
      staff: mr.staff,
      region: mr.staff.teamName || "Not Available", // Use teamName as region
      email: mr.staff.email,
      contactNumber: mr.staff.contactNo,
    }));

    const summary = summaryResult[0] || {
      totalSalesAmount: 0,
      totalOrders: 0,
      totalCustomers: 0,
      totalMRs: 0,
      averageOrderValue: 0,
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
    console.error("Error in /mr-wise-sales:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

export default router;