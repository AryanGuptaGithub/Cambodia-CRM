import express from "express";
import Customer from "../../models/master/customer.js";
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Build date filter based on period
// ─────────────────────────────────────────────────────────────────────────────
const buildDateFilter = (period) => {
  const now = new Date();
  if (period === "last_month") {
    return {
      invoiceDate: {
        $gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        $lte: new Date(now.getFullYear(), now.getMonth(), 0),
      },
    };
  }
  if (period === "last_year") {
    return {
      invoiceDate: {
        $gte: new Date(now.getFullYear() - 1, 0, 1),
        $lte: new Date(now.getFullYear() - 1, 11, 31),
      },
    };
  }
  return {};
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Core aggregation pipeline (shared between GET / and GET /export)
// ─────────────────────────────────────────────────────────────────────────────
const buildPipeline = (searchCondition, dateFilter) => [
  // Match province search
  ...(Object.keys(searchCondition).length > 0
    ? [{ $match: searchCondition }]
    : []),

  // Only customers with a province value
  {
    $match: {
      province: { $exists: true, $ne: null, $ne: "" },
    },
  },

  // Normalize province for case-insensitive grouping
  {
    $addFields: {
      normalizedProvince: { $toLower: "$province" },
    },
  },

  // Lookup ALL matching sales for each customer
  // FIX: project netSellingAmount AND totalAmount so we always have a value
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
            _id: 0,
            invoiceDate: 1,
            invoiceNumber: 1,
            // Use netSellingAmount if present, fall back to totalAmount
            saleAmount: {
              $ifNull: ["$netSellingAmount", { $ifNull: ["$totalAmount", 0] }],
            },
          },
        },
      ],
    },
  },

  // Group by normalized province
  {
    $group: {
      _id: "$normalizedProvince",
      province: { $first: "$province" },
      totalCustomers: { $sum: 1 },
      newCustomers: {
        $sum: { $cond: ["$isNew", 1, 0] },
      },
      activeCustomers: {
        $sum: {
          $cond: [{ $gt: [{ $size: "$sales" }, 0] }, 1, 0],
        },
      },
      // FIX: sum saleAmount (the normalized field) instead of netSellingAmount
      totalSalesAmount: {
        $sum: {
          $reduce: {
            input: "$sales",
            initialValue: 0,
            in: { $add: ["$$value", { $ifNull: ["$$this.saleAmount", 0] }] },
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
            $reduce: {
              input: "$sales",
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.saleAmount", 0] }] },
            },
          },
          invoiceCount: { $size: "$sales" },
          lastPurchaseDate: { $max: "$sales.invoiceDate" },
        },
      },
    },
  },

  // Compute derived metrics
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

  // Project final shape
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

  // Sort by most customers first
  { $sort: { totalCustomers: -1 } },
];

// ─────────────────────────────────────────────────────────────────────────────
// GET /
// Province-wise customers report with pagination
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 6, search = "", period = "all" } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Search condition — province only
    const searchCondition =
      search.trim() !== "" ? { province: new RegExp(search.trim(), "i") } : {};

    const dateFilter = buildDateFilter(period);
    const pipeline = buildPipeline(searchCondition, dateFilter);

    console.time("⏱️ Province report query");

    // Facet: paginated records + total count + summary
    const facetResult = await Customer.aggregate([
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
    ]);

    const records = facetResult[0]?.paginated || [];
    const totalCount = facetResult[0]?.totalCount[0]?.count || 0;

    // Unique province count (respects search)
    const uniqueProvincesResult = await Customer.aggregate([
      ...(Object.keys(searchCondition).length > 0
        ? [{ $match: searchCondition }]
        : []),
      { $match: { province: { $exists: true, $ne: null, $ne: "" } } },
      { $group: { _id: { $toLower: "$province" } } },
      { $count: "count" },
    ]);
    const uniqueProvincesCount = uniqueProvincesResult[0]?.count || 0;

    const summary = facetResult[0]?.summary[0] || {
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

    console.timeEnd("⏱️ Province report query");

    res.json({
      success: true,
      data: { summary, records, uniqueProvincesCount },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalRecords: totalCount,
        hasNext: pageNum < Math.ceil(totalCount / limitNum),
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Province report error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch province wise customer data",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /export
// Export province-wise customers to CSV
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const { search = "", period = "all" } = req.query;

    const searchCondition =
      search.trim() !== "" ? { province: new RegExp(search.trim(), "i") } : {};

    const dateFilter = buildDateFilter(period);

    // Reuse core pipeline, then project into CSV-friendly shape
    const exportPipeline = [
      ...buildPipeline(searchCondition, dateFilter),
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
    ];

    const data = await Customer.aggregate(exportPipeline);

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

    const csvContent =
      "\ufeff" +
      [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="province_wise_customers_${
        new Date().toISOString().split("T")[0]
      }.csv"`,
    );
    res.send(csvContent);
  } catch (error) {
    console.error("Error exporting province data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
      error: error.message,
    });
  }
});

export default router;
