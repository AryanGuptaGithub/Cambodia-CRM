import express from "express";
import Customer from "../../models/master/customer.js";
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

router.get("/province-wise-customer", async (req, res) => {
  try {
    const { page = 1, limit = 6, search = "", period = "all" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build search condition
    let searchCondition = {};
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      searchCondition = {
        $or: [
          { province: searchRegex },
          { zone: searchRegex },
          { name: searchRegex },
          { medicalRepName: searchRegex },
        ],
      };
    }

    console.time("⏱️ province-wise-customer-query");

    // Date filter for sales data (if period is specified)
    let dateFilter = {};
    if (period === "last_month" || period === "last_year") {
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
      } else if (period === "last_year") {
        const now = new Date();
        const firstDayOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
        const lastDayOfLastYear = new Date(now.getFullYear() - 1, 11, 31);
        dateFilter = {
          invoiceDate: {
            $gte: firstDayOfLastYear,
            $lte: lastDayOfLastYear
          }
        };
      }
    }

    // Main aggregation pipeline for province-wise customers
    const pipeline = [
      // Match customers based on search condition
      ...(Object.keys(searchCondition).length > 0 ? [{ $match: searchCondition }] : []),
      
      // Filter out customers without province
      {
        $match: {
          province: { $exists: true, $ne: null, $ne: "" }
        }
      },
      
      // Add a normalized province field for case-insensitive grouping
      {
        $addFields: {
          normalizedProvince: { $toLower: "$province" }
        }
      },
      
      // Lookup sales data for each customer (with date filter if applicable)
      {
        $lookup: {
          from: "salesummaries",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "sales",
          pipeline: [
            ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
            {
              $project: {
                netSellingAmount: 1,
                invoiceDate: 1,
                totalQty: 1,
              },
            },
          ],
        },
      },
      
      // Group by normalized province (case-insensitive)
      {
        $group: {
          _id: "$normalizedProvince",
          province: { $first: "$province" }, // Keep the original case for display
          normalizedProvince: { $first: "$normalizedProvince" },
          totalCustomers: { $sum: 1 },
          newCustomers: {
            $sum: { $cond: ["$isNew", 1, 0] },
          },
          activeCustomers: {
            $sum: {
              $cond: [
                { $gt: [{ $size: "$sales" }, 0] },
                1,
                0
              ],
            },
          },
          totalSalesAmount: { $sum: { $sum: "$sales.netSellingAmount" } },
          totalInvoices: { $sum: { $size: "$sales" } },
          customerDetails: {
            $push: {
              customerCode: "$customerCode",
              customerName: "$name",
              zone: "$zone",
              medicalRepName: "$medicalRepName",
              isNew: "$isNew",
              totalSales: { $sum: "$sales.netSellingAmount" },
              invoiceCount: { $size: "$sales" },
            },
          },
        },
      },
      
      // Calculate additional metrics
      {
        $addFields: {
          customerRetentionRate: {
            $cond: [
              { $gt: ["$totalCustomers", 0] },
              {
                $multiply: [
                  { $divide: ["$activeCustomers", "$totalCustomers"] },
                  100,
                ],
              },
              0,
            ],
          },
          averageSalesPerCustomer: {
            $cond: [
              { $gt: ["$totalCustomers", 0] },
              { $divide: ["$totalSalesAmount", "$totalCustomers"] },
              0,
            ],
          },
        },
      },
      
      // Project final fields
      {
        $project: {
          _id: 0,
          province: 1,
          totalCustomers: 1,
          newCustomers: 1,
          activeCustomers: 1,
          inactiveCustomers: { $subtract: ["$totalCustomers", "$activeCustomers"] },
          totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
          totalInvoices: 1,
          customerRetentionRate: { $round: ["$customerRetentionRate", 2] },
          averageSalesPerCustomer: { $round: ["$averageSalesPerCustomer", 2] },
          customerDetails: 1,
        },
      },
      
      // Sort by total customers (descending)
      { $sort: { totalCustomers: -1 } },
    ];

    // Use facet for pagination and summary
    const facetPipeline = [
      ...pipeline,
      {
        $facet: {
          paginated: [
            { $skip: skip },
            { $limit: limitNum },
          ],
          totalCount: [
            { $count: "count" }
          ],
          summary: [
            {
              $group: {
                _id: null,
                totalCustomers: { $sum: "$totalCustomers" },
                totalProvinces: { $sum: 1 },
                newCustomers: { $sum: "$newCustomers" },
                activeCustomers: { $sum: "$activeCustomers" },
                totalSalesAmount: { $sum: "$totalSalesAmount" },
              },
            },
            {
              $project: {
                _id: 0,
                totalCustomers: 1,
                totalProvinces: 1,
                newCustomers: 1,
                activeCustomers: 1,
                totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
                averageCustomersPerProvince: {
                  $cond: [
                    { $gt: ["$totalProvinces", 0] },
                    { $round: [{ $divide: ["$totalCustomers", "$totalProvinces"] }, 1] },
                    0
                  ]
                },
                customerActivationRate: {
                  $cond: [
                    { $gt: ["$totalCustomers", 0] },
                    {
                      $round: [
                        {
                          $multiply: [
                            { $divide: ["$activeCustomers", "$totalCustomers"] },
                            100,
                          ],
                        },
                        2,
                      ],
                    },
                    0,
                  ],
                },
              },
            },
          ],
        },
      },
    ];

    const result = await Customer.aggregate(facetPipeline);
    console.timeEnd("⏱️ province-wise-customer-query");

    const records = result[0]?.paginated || [];
    const totalCount = result[0]?.totalCount[0]?.count || 0;
    
    // Get unique provinces count separately to ensure accuracy (case-insensitive)
    const allProvinces = await Customer.aggregate([
      ...(Object.keys(searchCondition).length > 0 ? [{ $match: searchCondition }] : []),
      {
        $match: {
          province: { $exists: true, $ne: null, $ne: "" }
        }
      },
      {
        $group: {
          _id: { $toLower: "$province" }
        }
      },
      {
        $count: "count"
      }
    ]);
    
    const uniqueProvincesCount = allProvinces[0]?.count || 0;
    
    const summary = result[0]?.summary[0] || {
      totalCustomers: 0,
      totalProvinces: 0,
      newCustomers: 0,
      activeCustomers: 0,
      totalSalesAmount: 0,
      averageCustomersPerProvince: 0,
      customerActivationRate: 0,
    };

    // Override totalProvinces with the accurate unique count
    summary.totalProvinces = uniqueProvincesCount;

    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      success: true,
      data: {
        summary,
        records,
        uniqueProvincesCount: uniqueProvincesCount,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error in /province-wise-customer:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch province wise customer data",
      error: error.message,
    });
  }
});

export default router;