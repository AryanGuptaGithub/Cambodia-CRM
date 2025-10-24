import express from "express";
import Customer from "../../models/master/customer.js";
import SaleSummary from "../../models/sale/saleSummary.js";
const router = express.Router();

router.get("/customer-retention", async (req, res) => {
  try {
    const { page = 1, limit = 7, search = "", period = "all" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Calculate date range based on period
    let dateFilter = {};
    if (period === "last_month") {
      const now = new Date();
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      
      dateFilter = {
        invoiceDate: {
          $gte: firstDayOfLastMonth,
          $lte: lastDayOfLastMonth
        }
      };
    }

    // Build search condition
    let searchCondition = {};
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      searchCondition = {
        $or: [
          { zone: searchRegex },
          { name: searchRegex },
          { customerCode: searchRegex },
          { medicalRepName: searchRegex },
          { province: searchRegex },
        ],
      };
    }

    const retentionPipeline = [
      // Match based on search condition
      ...(Object.keys(searchCondition).length > 0
        ? [{ $match: searchCondition }]
        : []),

      // Lookup sales for each customer using customerCode with date filter
      {
        $lookup: {
          from: "salesummaries",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "sales",
          pipeline: [
            ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
            { $project: { invoiceDate: 1 } }
          ]
        },
      },
      // Group by zone and calculate metrics
      {
        $group: {
          _id: "$zone",
          zoneName: { $first: "$zone" },
          totalCustomers: { $sum: 1 },
          customerDetails: {
            $push: {
              customerId: "$_id",
              customerName: "$name",
              customerCode: "$customerCode",
              typeOfBusiness: "$typeOfBusiness",
              contactNumber: "$customerNumber",
              province: "$province",
              address: "$address",
              medicalRepName: "$medicalRepName",
              totalSales: { $size: "$sales" },
              firstPurchaseDate: { $min: "$sales.invoiceDate" },
              lastPurchaseDate: { $max: "$sales.invoiceDate" },
              isRepeatCustomer: {
                $cond: [{ $gt: [{ $size: "$sales" }, 1] }, true, false],
              },
              isActiveCustomer: {
                $cond: [
                  {
                    $and: [
                      { $ne: [{ $max: "$sales.invoiceDate" }, null] },
                      {
                        $gte: [
                          { $max: "$sales.invoiceDate" },
                          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                        ],
                      },
                    ],
                  },
                  true,
                  false,
                ],
              },
            },
          },
        },
      },
      // Calculate retention metrics
      {
        $addFields: {
          retainedCustomers: {
            $size: {
              $filter: {
                input: "$customerDetails",
                as: "customer",
                cond: { $eq: ["$$customer.isActiveCustomer", true] },
              },
            },
          },
          repeatCustomers: {
            $size: {
              $filter: {
                input: "$customerDetails",
                as: "customer",
                cond: { $eq: ["$$customer.isRepeatCustomer", true] },
              },
            },
          },
          retentionRate: {
            $cond: [
              { $gt: ["$totalCustomers", 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      {
                        $size: {
                          $filter: {
                            input: "$customerDetails",
                            as: "customer",
                            cond: {
                              $eq: ["$$customer.isActiveCustomer", true],
                            },
                          },
                        },
                      },
                      "$totalCustomers",
                    ],
                  },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
      // Project final fields
      {
        $project: {
          zoneId: "$_id",
          zoneName: 1,
          totalCustomers: 1,
          retainedCustomers: 1,
          repeatCustomers: 1,
          retentionRate: { $round: ["$retentionRate", 2] },
          customers: {
            $map: {
              input: "$customerDetails",
              as: "customer",
              in: {
                customerId: "$$customer.customerId",
                customerName: "$$customer.customerName",
                customerCode: "$$customer.customerCode",
                typeOfBusiness: "$$customer.typeOfBusiness",
                contactNumber: "$$customer.contactNumber",
                province: "$$customer.province",
                address: "$$customer.address",
                medicalRepName: "$$customer.medicalRepName",
                totalSales: "$$customer.totalSales",
                firstPurchaseDate: "$$customer.firstPurchaseDate",
                lastPurchaseDate: "$$customer.lastPurchaseDate",
                isRepeatCustomer: "$$customer.isRepeatCustomer",
                isActiveCustomer: "$$customer.isActiveCustomer",
              },
            },
          },
        },
      },
      // Sort by retention rate and total customers
      {
        $sort: {
          retentionRate: -1,
          totalCustomers: -1,
        },
      },
    ];

    // Get total count for pagination
    const totalCountAggregation = [
      ...retentionPipeline.slice(0, -2), // Remove sort and project for count
      { $count: "totalCount" },
    ];

    const totalCountResult = await Customer.aggregate(totalCountAggregation);
    const totalCount = totalCountResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    // Add pagination to main pipeline
    const paginatedPipeline = [
      ...retentionPipeline,
      { $skip: skip },
      { $limit: limitNum },
    ];

    // Execute the aggregation pipeline
    const records = await Customer.aggregate(paginatedPipeline);

    // Calculate overall summary with date filter
    const summaryPipeline = [
      // Lookup sales for all customers with date filter
      {
        $lookup: {
          from: "salesummaries",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "sales",
          pipeline: [
            ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
            { $project: { invoiceDate: 1 } }
          ]
        },
      },
      // Calculate customer metrics
      {
        $project: {
          totalSales: { $size: "$sales" },
          lastSaleDate: { $max: "$sales.invoiceDate" },
          isRepeatCustomer: { $gt: [{ $size: "$sales" }, 1] },
          isActiveCustomer: {
            $cond: [
              {
                $and: [
                  { $ne: [{ $max: "$sales.invoiceDate" }, null] },
                  {
                    $gte: [
                      { $max: "$sales.invoiceDate" },
                      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                    ],
                  },
                ],
              },
              true,
              false,
            ],
          },
        },
      },
      // Group to get overall statistics
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          repeatCustomers: {
            $sum: { $cond: ["$isRepeatCustomer", 1, 0] },
          },
          retainedCustomers: {
            $sum: { $cond: ["$isActiveCustomer", 1, 0] },
          },
        },
      },
      // Calculate rates
      {
        $project: {
          totalCustomers: 1,
          repeatCustomers: 1,
          retainedCustomers: 1,
          retentionRate: {
            $cond: [
              { $gt: ["$totalCustomers", 0] },
              {
                $multiply: [
                  { $divide: ["$retainedCustomers", "$totalCustomers"] },
                  100,
                ],
              },
              0,
            ],
          },
          repeatRate: {
            $cond: [
              { $gt: ["$totalCustomers", 0] },
              {
                $multiply: [
                  { $divide: ["$repeatCustomers", "$totalCustomers"] },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
    ];

    const summaryResult = await Customer.aggregate(summaryPipeline);
    const summary = summaryResult[0] || {
      totalCustomers: 0,
      retainedCustomers: 0,
      repeatCustomers: 0,
      retentionRate: 0,
      repeatRate: 0,
    };

    const responseData = {
      success: true,
      data: {
        summary: {
          totalCustomers: summary.totalCustomers,
          retainedCustomers: summary.retainedCustomers,
          retentionRate: Math.round(summary.retentionRate * 100) / 100,
          repeatCustomers: summary.repeatCustomers,
        },
        records: records.map((record) => ({
          zoneId: record.zoneId,
          zoneName: record.zoneName,
          totalCustomers: record.totalCustomers,
          retainedCustomers: record.retainedCustomers,
          repeatCustomers: record.repeatCustomers,
          retentionRate: record.retentionRate,
          customers: record.customers || [],
        })),
      },
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    };

    res.json(responseData);
  } catch (error) {
    console.error("Error in customer retention API:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch customer retention data",
      message: error.message,
    });
  }
});

router.get("/annual-customer-repeat-rate", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 7;
    const search = req.query.search?.trim() || "";
    const period = req.query.period || "last_year";

    // Calculate date range based on period
    let dateFilter = {};
    if (period === "last_year") {
      const now = new Date();
      const firstDayOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
      const lastDayOfLastYear = new Date(now.getFullYear() - 1, 11, 31);

      dateFilter = {
        invoiceDate: {
          $gte: firstDayOfLastYear,
          $lte: lastDayOfLastYear,
        },
      };
    } else if (period === "last_month") {
      const now = new Date();
      const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      
      dateFilter = {
        invoiceDate: {
          $gte: firstDayOfLastMonth,
          $lte: lastDayOfLastMonth
        }
      };
    }

    // 🔍 Match filter for search and date
    const matchQuery = { ...dateFilter };
    if (search) {
      matchQuery.$or = [
        { "customerDetails.name": { $regex: search, $options: "i" } },
        { "customerDetails.customerCode": { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
      ];
    }

    // 🧮 Aggregation pipeline for annual repeat rate
    const pipeline = [
      { $match: matchQuery },
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
      {
        $group: {
          _id: "$customerCode",
          customerName: { $first: "$customerDetails.name" },
          customerCode: { $first: "$customerCode" },
          totalPurchases: { $sum: 1 },
          firstPurchaseDate: { $min: "$invoiceDate" },
          lastPurchaseDate: { $max: "$invoiceDate" },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
      {
        $addFields: {
          isRepeatCustomer: {
            $cond: {
              if: { $gte: ["$totalPurchases", 2] },
              then: true,
              else: false,
            },
          },
        },
      },
      { $sort: { totalPurchases: -1, lastPurchaseDate: -1 } },
    ];

    // Get total count for pagination
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: "total" });

    const countResult = await SaleSummary.aggregate(countPipeline);
    const totalRecords = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalRecords / limit);

    // Apply pagination to main pipeline
    pipeline.push({ $skip: (page - 1) * limit }, { $limit: limit });

    const records = await SaleSummary.aggregate(pipeline);

    // 📊 Calculate summary statistics
    const summaryPipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerDetails",
        },
      },
      {
        $group: {
          _id: "$customerCode",
          totalPurchases: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          repeatCustomers: {
            $sum: {
              $cond: [{ $gte: ["$totalPurchases", 2] }, 1, 0],
            },
          },
          newCustomers: {
            $sum: {
              $cond: [{ $eq: ["$totalPurchases", 1] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          totalCustomers: 1,
          repeatCustomers: 1,
          newCustomers: 1,
          repeatRate: {
            $cond: [
              { $eq: ["$totalCustomers", 0] },
              0,
              {
                $multiply: [
                  { $divide: ["$repeatCustomers", "$totalCustomers"] },
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
            repeatCustomers: 0,
            newCustomers: 0,
            repeatRate: 0,
          };
    // ✅ Format the response records
    const formattedRecords = records.map((record) => ({
      customerCode: record.customerCode,
      customerName: record.customerName || "N/A",
      totalPurchases: record.totalPurchases,
      firstPurchaseDate: record.firstPurchaseDate,
      lastPurchaseDate: record.lastPurchaseDate,
      isRepeatCustomer: record.isRepeatCustomer,
      totalAmount: record.totalAmount || 0,
    }));

    // ✅ Send response
    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalCustomers: summary.totalCustomers,
          repeatCustomers: summary.repeatCustomers,
          repeatRate: parseFloat(summary.repeatRate.toFixed(2)),
          newCustomers: summary.newCustomers,
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
    console.error("❌ Error fetching annual customer repeat rate data:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching annual customer repeat rate data",
      error: error.message,
    });
  }
});

export default router;