// routes/provinceWiseSale.js
import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";

const router = express.Router();

router.get("/province-wise-sale", async (req, res) => {
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

    console.time("⏱️ province-wise-sale-query");

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

    // Main aggregation pipeline for province-wise sales
    const pipeline = [
      // Match sales based on date filter (only if period is specified)
      ...(Object.keys(dateFilter).length > 0 ? [{ $match: dateFilter }] : []),
      
      // Lookup customer details to get province information
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
      
      // Filter out records without province
      {
        $match: {
          "customerDetails.province": { $exists: true, $ne: null, $ne: "" }
        }
      },
      
      // Add normalized province field for case-insensitive grouping
      {
        $addFields: {
          normalizedProvince: { $toLower: "$customerDetails.province" }
        }
      },
      
      // Apply search condition if any
      ...(Object.keys(searchCondition).length > 0 ? [{ $match: searchCondition }] : []),
      
      // Group by normalized province (case-insensitive)
      {
        $group: {
          _id: "$normalizedProvince",
          province: { $first: "$customerDetails.province" }, // Keep original case for display
          normalizedProvince: { $first: "$normalizedProvince" },
          totalSalesAmount: { $sum: "$netSellingAmount" },
          totalInvoices: { $sum: 1 },
          totalQuantity: { $sum: "$totalQty" },
          averageSaleValue: { $avg: "$netSellingAmount" },
          uniqueCustomers: { $addToSet: "$customerCode" },
          customerDetails: {
            $push: {
              customerCode: "$customerCode",
              customerName: "$customerDetails.name",
              zone: "$customerDetails.zone",
              medicalRepName: "$customerDetails.medicalRepName",
              totalSales: "$netSellingAmount",
              invoiceDate: "$invoiceDate",
              quantity: "$totalQty",
            },
          },
        },
      },
      
      // Calculate additional metrics
      {
        $addFields: {
          totalCustomers: { $size: "$uniqueCustomers" },
          averageSalePerCustomer: {
            $cond: [
              { $gt: [{ $size: "$uniqueCustomers" }, 0] },
              { $divide: ["$totalSalesAmount", { $size: "$uniqueCustomers" }] },
              0
            ]
          },
        },
      },
      
      // Project final fields
      {
        $project: {
          _id: 0,
          province: 1,
          totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
          totalInvoices: 1,
          totalQuantity: 1,
          averageSaleValue: { $round: ["$averageSaleValue", 2] },
          totalCustomers: 1,
          averageSalePerCustomer: { $round: ["$averageSalePerCustomer", 2] },
          customerDetails: 1,
        },
      },
      
      // Sort by total sales amount (descending)
      { $sort: { totalSalesAmount: -1 } },
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
                totalSales: { $sum: "$totalSalesAmount" },
                totalProvinces: { $sum: 1 },
                totalInvoices: { $sum: "$totalInvoices" },
                totalCustomers: { $sum: "$totalCustomers" },
                totalQuantity: { $sum: "$totalQuantity" },
              },
            },
            {
              $project: {
                _id: 0,
                totalSales: { $round: ["$totalSales", 2] },
                totalProvinces: 1,
                totalInvoices: 1,
                totalCustomers: 1,
                totalQuantity: 1,
                averageSalePerProvince: {
                  $cond: [
                    { $gt: ["$totalProvinces", 0] },
                    { $round: [{ $divide: ["$totalSales", "$totalProvinces"] }, 2] },
                    0
                  ]
                },
                averageSalePerInvoice: {
                  $cond: [
                    { $gt: ["$totalInvoices", 0] },
                    { $round: [{ $divide: ["$totalSales", "$totalInvoices"] }, 2] },
                    0
                  ]
                },
              },
            },
          ],
        },
      },
    ];

    const result = await SaleSummary.aggregate(facetPipeline);
    console.timeEnd("⏱️ province-wise-sale-query");

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
      totalSales: 0,
      totalProvinces: 0,
      totalInvoices: 0,
      totalCustomers: 0,
      totalQuantity: 0,
      averageSalePerProvince: 0,
      averageSalePerInvoice: 0,
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
    console.error("❌ Error in /province-wise-sale:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch province wise sale data",
      error: error.message,
    });
  }
});

export default router;