import express from "express";
import Customer from "../../models/master/customer.js";
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

/**
 * GET /
 * Get province wise customers report
 * Accessible at: /api/reports/province-wise-customers
 */
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 6, search = "", period = "all" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build search condition - ONLY by province
    let searchCondition = {};
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      searchCondition = {
        province: searchRegex,
      };
    }

    console.time("⏱️ Total Query Execution Time");

    // Date filter for sales data (if period is specified)
    let dateFilter = {};
    if (period === "last_month" || period === "last_year") {
      if (period === "last_month") {
        const now = new Date();
        const firstDayOfLastMonth = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1
        );
        const lastDayOfLastMonth = new Date(
          now.getFullYear(),
          now.getMonth(),
          0
        );
        dateFilter = {
          invoiceDate: {
            $gte: firstDayOfLastMonth,
            $lte: lastDayOfLastMonth,
          },
        };
      } else if (period === "last_year") {
        const now = new Date();
        const firstDayOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
        const lastDayOfLastYear = new Date(now.getFullYear() - 1, 11, 31);
        dateFilter = {
          invoiceDate: {
            $gte: firstDayOfLastYear,
            $lte: lastDayOfLastYear,
          },
        };
      }
    }

    // Main aggregation pipeline for province-wise customers
    const pipeline = [
      // Match customers based on search condition (province only)
      ...(Object.keys(searchCondition).length > 0
        ? [{ $match: searchCondition }]
        : []),

      // Filter out customers without province
      {
        $match: {
          province: { $exists: true, $ne: null, $ne: "" },
        },
      },

      // Add a normalized province field for case-insensitive grouping
      {
        $addFields: {
          normalizedProvince: { $toLower: "$province" },
        },
      },

      // Lookup sales data for each customer (with date filter if applicable)
      {
        $lookup: {
          from: "salesummaries",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "sales",
          pipeline: [
            ...(Object.keys(dateFilter).length > 0
              ? [{ $match: dateFilter }]
              : []),
            {
              $project: {
                netSellingAmount: 1,
                invoiceDate: 1,
                totalQty: 1,
                invoiceNumber: 1,
              },
            },
          ],
        },
      },

      // Group by normalized province (case-insensitive)
      {
        $group: {
          _id: "$normalizedProvince",
          province: { $first: "$province" },
          normalizedProvince: { $first: "$normalizedProvince" },
          totalCustomers: { $sum: 1 },
          newCustomers: {
            $sum: { $cond: ["$isNew", 1, 0] },
          },
          activeCustomers: {
            $sum: {
              $cond: [{ $gt: [{ $size: "$sales" }, 0] }, 1, 0],
            },
          },
          totalSalesAmount: {
            $sum: {
              $reduce: {
                input: "$sales",
                initialValue: 0,
                in: { $add: ["$$value", "$$this.netSellingAmount"] },
              },
            },
          },
          totalInvoices: { $sum: { $size: "$sales" } },
          customerDetails: {
            $push: {
              customerCode: "$customerCode",
              customerName: "$name",
              zone: "$zone",
              medicalRepName: "$medicalRepName",
              isNew: "$isNew",
              totalSales: {
                $sum: {
                  $map: {
                    input: "$sales",
                    as: "sale",
                    in: "$$sale.netSellingAmount",
                  },
                },
              },
              invoiceCount: { $size: "$sales" },
              lastPurchaseDate: { $max: "$sales.invoiceDate" },
            },
          },
        },
      },

      // Calculate additional metrics
      {
        $addFields: {
          inactiveCustomers: {
            $subtract: ["$totalCustomers", "$activeCustomers"],
          },
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

      // Project final fields - Convert rounded values to numbers
      {
        $project: {
          _id: 0,
          province: 1,
          totalCustomers: 1,
          newCustomers: 1,
          activeCustomers: 1,
          inactiveCustomers: 1,
          totalSalesAmount: {
            $toDouble: { $round: ["$totalSalesAmount", 2] },
          },
          totalInvoices: 1,
          customerRetentionRate: {
            $toDouble: { $round: ["$customerRetentionRate", 2] },
          },
          averageSalesPerCustomer: {
            $toDouble: { $round: ["$averageSalesPerCustomer", 2] },
          },
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
          paginated: [{ $skip: skip }, { $limit: limitNum }],
          totalCount: [{ $count: "count" }],
          summary: [
            {
              $group: {
                _id: null,
                totalCustomers: { $sum: "$totalCustomers" },
                totalProvinces: { $sum: 1 },
                newCustomers: { $sum: "$newCustomers" },
                activeCustomers: { $sum: "$activeCustomers" },
                totalSalesAmount: { $sum: "$totalSalesAmount" },
                totalInvoices: { $sum: "$totalInvoices" },
              },
            },
            {
              $project: {
                _id: 0,
                totalCustomers: 1,
                totalProvinces: 1,
                newCustomers: 1,
                activeCustomers: 1,
                totalSalesAmount: {
                  $toDouble: { $round: ["$totalSalesAmount", 2] },
                },
                totalInvoices: 1,
                averageCustomersPerProvince: {
                  $cond: [
                    { $gt: ["$totalProvinces", 0] },
                    {
                      $toDouble: {
                        $round: [
                          { $divide: ["$totalCustomers", "$totalProvinces"] },
                          1,
                        ],
                      },
                    },
                    0,
                  ],
                },
                customerActivationRate: {
                  $cond: [
                    { $gt: ["$totalCustomers", 0] },
                    {
                      $toDouble: {
                        $round: [
                          {
                            $multiply: [
                              {
                                $divide: [
                                  "$activeCustomers",
                                  "$totalCustomers",
                                ],
                              },
                              100,
                            ],
                          },
                          2,
                        ],
                      },
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
    const records = result[0]?.paginated || [];
    const totalCount = result[0]?.totalCount[0]?.count || 0;

    // For unique provinces count with search
    const uniqueProvincesPipeline = [
      ...(Object.keys(searchCondition).length > 0
        ? [{ $match: searchCondition }]
        : []),
      {
        $match: {
          province: { $exists: true, $ne: null, $ne: "" },
        },
      },
      {
        $group: {
          _id: { $toLower: "$province" },
        },
      },
      {
        $count: "count",
      },
    ];

    const allProvinces = await Customer.aggregate(uniqueProvincesPipeline);
    const uniqueProvincesCount = allProvinces[0]?.count || 0;

    const summary = result[0]?.summary[0] || {
      totalCustomers: 0,
      totalProvinces: 0,
      newCustomers: 0,
      activeCustomers: 0,
      totalSalesAmount: 0,
      totalInvoices: 0,
      averageCustomersPerProvince: 0,
      customerActivationRate: 0,
    };

    summary.totalProvinces = uniqueProvincesCount;

    const totalPages = Math.ceil(totalCount / limitNum);
    const responseData = {
      success: true,
      data: {
        summary,
        records,
        uniqueProvincesCount,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    };

    console.timeEnd("⏱️ Total Query Execution Time");

    res.json(responseData);
  } catch (error) {
    console.error("❌ ========== API ERROR ==========");
    console.error("🔴 Error:", error.message);
    console.error("🔴 Stack:", error.stack);
    console.error("❌ ========== END ERROR ==========\n");

    res.status(500).json({
      success: false,
      message: "Failed to fetch province wise customer data",
      error: error.message,
    });
  }
});

/**
 * GET /export
 * Export province wise customers to CSV
 * Accessible at: /api/reports/province-wise-customers/export
 */
router.get("/export", async (req, res) => {
  try {
    const { search = "", period = "all" } = req.query;

    // Build search condition - ONLY by province
    let searchCondition = {};
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      searchCondition = {
        province: searchRegex,
      };
    }

    // Date filter for sales data
    let dateFilter = {};
    if (period === "last_month" || period === "last_year") {
      if (period === "last_month") {
        const now = new Date();
        const firstDayOfLastMonth = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1
        );
        const lastDayOfLastMonth = new Date(
          now.getFullYear(),
          now.getMonth(),
          0
        );
        dateFilter = {
          invoiceDate: {
            $gte: firstDayOfLastMonth,
            $lte: lastDayOfLastMonth,
          },
        };
      } else if (period === "last_year") {
        const now = new Date();
        const firstDayOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
        const lastDayOfLastYear = new Date(now.getFullYear() - 1, 11, 31);
        dateFilter = {
          invoiceDate: {
            $gte: firstDayOfLastYear,
            $lte: lastDayOfLastYear,
          },
        };
      }
    }

    const pipeline = [
      ...(Object.keys(searchCondition).length > 0
        ? [{ $match: searchCondition }]
        : []),
      {
        $match: {
          province: { $exists: true, $ne: null, $ne: "" },
        },
      },
      {
        $addFields: {
          normalizedProvince: { $toLower: "$province" },
        },
      },
      {
        $lookup: {
          from: "salesummaries",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "sales",
          pipeline: [
            ...(Object.keys(dateFilter).length > 0
              ? [{ $match: dateFilter }]
              : []),
            { $project: { netSellingAmount: 1, invoiceDate: 1 } },
          ],
        },
      },
      {
        $group: {
          _id: "$normalizedProvince",
          province: { $first: "$province" },
          totalCustomers: { $sum: 1 },
          newCustomers: { $sum: { $cond: ["$isNew", 1, 0] } },
          activeCustomers: {
            $sum: { $cond: [{ $gt: [{ $size: "$sales" }, 0] }, 1, 0] },
          },
          totalSalesAmount: {
            $sum: {
              $reduce: {
                input: "$sales",
                initialValue: 0,
                in: { $add: ["$$value", "$$this.netSellingAmount"] },
              },
            },
          },
          totalInvoices: { $sum: { $size: "$sales" } },
        },
      },
      {
        $addFields: {
          inactiveCustomers: {
            $subtract: ["$totalCustomers", "$activeCustomers"],
          },
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
      {
        $project: {
          _id: 0,
          Province: "$province",
          "Total Customers": "$totalCustomers",
          "Active Customers": "$activeCustomers",
          "Inactive Customers": "$inactiveCustomers",
          "New Customers": "$newCustomers",
          "Total Sales Amount": { $round: ["$totalSalesAmount", 2] },
          "Total Invoices": "$totalInvoices",
          "Average Sales Per Customer": {
            $round: ["$averageSalesPerCustomer", 2],
          },
          "Customer Retention Rate (%)": {
            $round: ["$customerRetentionRate", 2],
          },
        },
      },
      { $sort: { "Total Customers": -1 } },
    ];

    const data = await Customer.aggregate(pipeline);

    // Convert to CSV format
    const headers = [
      "Province",
      "Total Customers",
      "Active Customers",
      "Inactive Customers",
      "New Customers",
      "Total Sales Amount",
      "Total Invoices",
      "Average Sales Per Customer",
      "Customer Retention Rate (%)",
    ];

    // Format CSV rows
    const csvRows = data.map((row) => [
      `"${(row.Province || "").replace(/"/g, '""')}"`,
      row["Total Customers"] || 0,
      row["Active Customers"] || 0,
      row["Inactive Customers"] || 0,
      row["New Customers"] || 0,
      row["Total Sales Amount"] || 0,
      row["Total Invoices"] || 0,
      row["Average Sales Per Customer"] || 0,
      row["Customer Retention Rate (%)"] || 0,
    ]);

    // Add BOM for UTF-8 encoding (helps with Excel)
    const csvContent =
      "\ufeff" +
      [headers.join(","), ...csvRows.map((row) => row.join(","))].join("\n");

    // Set response headers for file download
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="province_wise_customers_${
        new Date().toISOString().split("T")[0]
      }.csv"`
    );

    res.send(csvContent);
  } catch (error) {
    console.error("Error exporting data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
      error: error.message,
    });
  }
});

export default router;
