import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";

const router = express.Router();

router.get("/customer-product-acceptance-rate", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 7;
    const search = req.query.search?.trim() || "";

    // 🔍 Build match query
    const matchQuery = {};
    if (search) {
      matchQuery.$or = [
        { "customerDetails.name": { $regex: search, $options: "i" } },
        { "customerDetails.customerCode": { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
        { productName: { $regex: search, $options: "i" } },
      ];
    }

    // 🧮 Main aggregation pipeline (customer + product wise)
    const pipeline = [
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerDetails",
        },
      },
      {
        $unwind: {
          path: "$customerDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $match: matchQuery },
      {
        $group: {
          _id: {
            customerCode: "$customerCode",
            customerName: "$customerDetails.name",
            productName: "$productName",
          },
          totalProducts: { $sum: 1 },
          acceptedCount: {
            $sum: { $cond: [{ $eq: ["$isProductAccept", true] }, 1, 0] },
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ["$isProductAccept", false] }, 1, 0] },
          },
        },
      },
      {
        $addFields: {
          acceptanceRate: {
            $cond: [
              { $eq: ["$totalProducts", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$acceptedCount", "$totalProducts"] },
                  100,
                ],
              },
            ],
          },
        },
      },
      {
        $project: {
          customerCode: "$_id.customerCode",
          customerName: { $ifNull: ["$_id.customerName", "N/A"] },
          productName: "$_id.productName",
          totalProducts: 1,
          acceptedCount: 1,
          rejectedCount: 1,
          acceptanceRate: { $round: ["$acceptanceRate", 2] },
          _id: 0,
        },
      },
      { $sort: { customerName: 1, productName: 1 } },
    ];

    // 📊 Get total record count
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await SaleSummary.aggregate(countPipeline);
    const totalRecords = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalRecords / limit);

    // 📄 Apply pagination
    const paginatedPipeline = [...pipeline, { $skip: (page - 1) * limit }, { $limit: limit }];
    const records = await SaleSummary.aggregate(paginatedPipeline);

    // 🧾 Global Summary (all customers)
    const summaryPipeline = [
      {
        $group: {
          _id: null,
          totalCustomers: { $addToSet: "$customerCode" },
          totalProducts: { $sum: 1 },
          totalAccepted: {
            $sum: { $cond: [{ $eq: ["$isProductAccept", true] }, 1, 0] },
          },
          totalRejected: {
            $sum: { $cond: [{ $eq: ["$isProductAccept", false] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          totalCustomers: { $size: "$totalCustomers" },
          totalProducts: 1,
          totalAccepted: 1,
          totalRejected: 1,
          acceptanceRate: {
            $cond: [
              { $eq: ["$totalProducts", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$totalAccepted", "$totalProducts"] },
                  100,
                ],
              },
            ],
          },
        },
      },
    ];

    const summaryResult = await SaleSummary.aggregate(summaryPipeline);
    const summary =
      summaryResult.length > 0
        ? summaryResult[0]
        : {
            totalCustomers: 0,
            totalProducts: 0,
            totalAccepted: 0,
            totalRejected: 0,
            acceptanceRate: 0,
          };

    // ✅ Format response records
    const formattedRecords = records.map((record, index) => ({
      srNo: index + 1 + (page - 1) * limit,
      customerCode: record.customerCode,
      customerName: record.customerName,
      productName: record.productName,
      totalProducts: record.totalProducts,
      acceptedCount: record.acceptedCount,
      rejectedCount: record.rejectedCount,
      acceptanceRate: record.acceptanceRate,
    }));

    // ✅ Send response
    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalCustomers: summary.totalCustomers,
          totalProducts: summary.totalProducts,
          totalAccepted: summary.totalAccepted,
          totalRejected: summary.totalRejected,
          acceptanceRate: parseFloat(summary.acceptanceRate.toFixed(2)),
        },
        records: formattedRecords,
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching product acceptance rate:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching acceptance rate data",
      error: error.message,
    });
  }
});

export default router;
