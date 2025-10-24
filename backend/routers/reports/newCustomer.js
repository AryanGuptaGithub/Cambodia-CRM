import express from "express";
import Customer from "../../models/master/customer.js";
import Staff from "../../models/staffMember/staff.js"; 

const router = express.Router();

router.get("/new-customers", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 7,
      search = "",
      reportType = "MR Wise",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;
    
    let matchStage = { isNew: true, enabled: true };
    
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      if (reportType === "MR Wise") {
        matchStage.medicalRepName = searchRegex;
      } else {
        matchStage.zone = searchRegex;
      }
    }

    let records = [];
    let totalRecords = 0;
    let summary = {};

    if (reportType === "MR Wise") {
      const allStaff = await Staff.find({ enabled: true }).lean();      
      const staffMap = new Map();
      allStaff.forEach(staff => {
        const normalizedKey = staff.medicalRepName.toLowerCase().trim();
        staffMap.set(normalizedKey, {
          MRId: staff.MRId,
          contactNo: staff.contactNo,
          email: staff.email,
          teamName: staff.teamName,
          originalName: staff.medicalRepName 
        });
      });

      const aggregationPipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: "$medicalRepName",
            mrName: { $first: "$medicalRepName" },
            zone: { $first: "$zone" },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$createdAt" }
          }
        },
        { $sort: { newCustomers: -1 } },
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

      const [result] = await Customer.aggregate(aggregationPipeline);
      records = result.paginatedResults.map((item) => {
        const normalizedMRName = item.mrName.toLowerCase().trim();
        const staffDetails = staffMap.get(normalizedMRName);
        
        if (staffDetails) {
          return {
            mrId: staffDetails.MRId || "N/A",
            mrName: staffDetails.originalName || item.mrName, // Use original name from staff
            contactNo: staffDetails.contactNo || "N/A",
            email: staffDetails.email || "N/A",
            teamName: staffDetails.teamName || "N/A",
            zone: item.zone || "N/A",
            newCustomers: item.newCustomers,
            date: item.latestDate
              ? new Date(item.latestDate).toLocaleDateString()
              : new Date().toLocaleDateString(),
          };
        } else {
          // If no staff match found, return basic customer data
          return {
            mrId: "N/A",
            mrName: item.mrName || "Unknown",
            contactNo: "N/A",
            email: "N/A",
            teamName: "N/A",
            zone: item.zone || "N/A",
            newCustomers: item.newCustomers,
            date: item.latestDate
              ? new Date(item.latestDate).toLocaleDateString()
              : new Date().toLocaleDateString(),
          };
        }
      });

      totalRecords = result.totalCount[0]?.total || 0;

    } else {
      // Zone Wise Report
      const aggregationPipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: "$zone",
            zoneName: { $first: "$zone" },
            totalMRs: { $addToSet: "$medicalRepName" },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$createdAt" },
          },
        },
        {
          $project: {
            zoneName: 1,
            totalMRs: { $size: "$totalMRs" },
            newCustomers: 1,
            averagePerMR: {
              $cond: [
                { $gt: [{ $size: "$totalMRs" }, 0] },
                { $divide: ["$newCustomers", { $size: "$totalMRs" }] },
                0,
              ],
            },
            latestDate: 1,
          },
        },
        { $sort: { newCustomers: -1 } },
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

      const [result] = await Customer.aggregate(aggregationPipeline);
      
      records = result.paginatedResults.map((item) => ({
        zoneId: item._id || "N/A",
        zoneName: item.zoneName || "Unknown",
        totalMRs: item.totalMRs,
        newCustomers: item.newCustomers,
        averagePerMR: item.averagePerMR,
        date: item.latestDate
          ? new Date(item.latestDate).toLocaleDateString()
          : new Date().toLocaleDateString(),
      }));

      totalRecords = result.totalCount[0]?.total || 0;
    }

    // Get summary statistics
    const summaryResult = await Customer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalNewCustomers: { $sum: 1 },
          totalMRs: { $addToSet: "$medicalRepName" },
          totalZones: { $addToSet: "$zone" },
        },
      },
      {
        $project: {
          totalNewCustomers: 1,
          totalMRs: { $size: "$totalMRs" },
          totalZones: { $size: "$totalZones" },
          averageCustomersPerMR: {
            $cond: [
              { $gt: [{ $size: "$totalMRs" }, 0] },
              { $divide: ["$totalNewCustomers", { $size: "$totalMRs" }] },
              0,
            ],
          },
        },
      },
    ]);

    summary = summaryResult[0] || {
      totalNewCustomers: 0,
      totalMRs: 0,
      totalZones: 0,
      averageCustomersPerMR: 0,
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
      data: { summary, records },
      pagination,
    });
  } catch (error) {
    console.error("❌ Error fetching new customers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch new customer data",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;