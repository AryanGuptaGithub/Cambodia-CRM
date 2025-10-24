import express from "express";
import Customer from "../../models/master/customer.js";

const router = express.Router();

router.get("/zone-wise-customers", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 7,
      search = "",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let matchStage = { enabled: true };

    // Add search filter
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchStage.$or = [
        { zone: searchRegex },
        { name: searchRegex },
        { customerCode: searchRegex },
        { medicalRepName: searchRegex }
      ];
    }

    // First, get zones with basic info (without pushing all customer data)
    const zonesAggregation = [
      { $match: matchStage },
      {
        $group: {
          _id: "$zone",
          zoneName: { $first: "$zone" },
          totalCustomers: { $sum: 1 },
          totalMRs: { $addToSet: "$medicalRepName" },
        }
      },
      {
        $project: {
          zoneName: 1,
          totalCustomers: 1,
          totalMRs: { $size: "$totalMRs" },
          averagePerMR: {
            $cond: [
              { $gt: [{ $size: "$totalMRs" }, 0] },
              { $divide: ["$totalCustomers", { $size: "$totalMRs" }] },
              0,
            ],
          }
        }
      },
      { $sort: { totalCustomers: -1 } },
      {
        $facet: {
          paginatedResults: [
            { $skip: skip },
            { $limit: limitNum }
          ],
          totalCount: [
            { $count: "total" }
          ]
        }
      }
    ];

    // Execute with allowDiskUse to prevent memory issues
    const [zonesResult] = await Customer.aggregate(zonesAggregation).allowDiskUse(true);
    
    const totalRecords = zonesResult.totalCount[0]?.total || 0;

    // Now get customers for each zone separately to avoid memory issues
    const records = [];
    
    for (const zoneData of zonesResult.paginatedResults) {
      const zoneName = zoneData._id;
      
      // Get customers for this specific zone
      const zoneCustomers = await Customer.find({
        ...matchStage,
        zone: zoneName
      })
      .select('_id customerCode name typeOfBusiness customerNumber address medicalRepName province isNew createdAt remark')
      .sort({ name: 1 })
      .lean();

      records.push({
        zoneId: zoneName ? zoneName.replace(/\s+/g, '_').toUpperCase() : "UNKNOWN_ZONE",
        zoneName: zoneData.zoneName || "Unknown Zone",
        totalMRs: zoneData.totalMRs || 0,
        totalCustomers: zoneData.totalCustomers || 0,
        averagePerMR: parseFloat((zoneData.averagePerMR || 0).toFixed(1)),
        customers: zoneCustomers.map(customer => ({
          customerId: customer._id,
          customerCode: customer.customerCode,
          customerName: customer.name,
          typeOfBusiness: customer.typeOfBusiness,
          contactNumber: customer.customerNumber,
          address: customer.address,
          medicalRepName: customer.medicalRepName,
          province: customer.province,
          isNew: customer.isNew,
          createdAt: customer.createdAt,
          remark: customer.remark
        }))
      });
    }

    // Get summary statistics (optimized)
    const summaryResult = await Customer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          totalZones: { $addToSet: "$zone" },
          totalMRs: { $addToSet: "$medicalRepName" },
        },
      },
      {
        $project: {
          totalCustomers: 1,
          totalZones: { $size: "$totalZones" },
          totalMRs: { $size: "$totalMRs" },
          averageCustomersPerZone: {
            $cond: [
              { $gt: [{ $size: "$totalZones" }, 0] },
              { $divide: ["$totalCustomers", { $size: "$totalZones" }] },
              0,
            ],
          },
        },
      },
    ]).allowDiskUse(true);

    const summary = summaryResult[0] || {
      totalCustomers: 0,
      totalZones: 0,
      totalMRs: 0,
      averageCustomersPerZone: 0,
    };

    // Format summary numbers
    const formattedSummary = {
      totalCustomers: summary.totalCustomers || 0,
      totalZones: summary.totalZones || 0,
      totalMRs: summary.totalMRs || 0,
      averageCustomersPerZone: parseFloat((summary.averageCustomersPerZone || 0).toFixed(1))
    };

    // Pagination info
    const totalPages = Math.ceil(totalRecords / limitNum);
    const pagination = {
      currentPage: pageNum,
      totalPages,
      totalRecords,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    };

    // Final Response
    res.json({
      success: true,
      data: {
        summary: formattedSummary,
        records: records,
      },
      pagination: pagination,
    });

  } catch (error) {
    console.error("❌ Error fetching zone wise customers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch zone wise customer data",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;