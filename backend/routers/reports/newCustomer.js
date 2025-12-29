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
      const allStaff = await Staff.find({}).lean();
      const staffMap = new Map();

      allStaff.forEach((staff, index) => {        
        if (staff._id) {
          const staffId = staff._id.toString();
          staffMap.set(staffId, {
            MRId: staff.MRId,
            contactNo: staff.contactNo,
            email: staff.email,
            teamName: staff.teamName,
            originalName: staff.medicalRepName,
            staffId: staffId
          });
        } 
      });

      const customerAggregationPipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: { 
              $ifNull: [
                "$medicalRepId", 
                { $ifNull: ["$medicalRepName", "Unknown MR"] }
              ] 
            },
            mrName: { $first: "$medicalRepName" },
            medicalRepId: { $first: "$medicalRepId" },
            zone: { $first: "$zone" },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$createdAt" },
          },
        },
        { $sort: { newCustomers: -1 } },
        {
          $facet: {
            paginatedResults: [{ $skip: skip }, { $limit: limitNum }],
            totalCount: [{ $count: "total" }],
          },
        },
      ];

      const [result] = await Customer.aggregate(customerAggregationPipeline);
      records = result.paginatedResults.map((item, index) => {
        const mrName = item.mrName || "Unknown MR";
        let staffDetails = null;
        
        if (item.medicalRepId) {
          const staffId = item.medicalRepId.toString();
          staffDetails = staffMap.get(staffId);
        } 
        
        if (!staffDetails && mrName && mrName !== "Unknown MR") {
          const normalizedMRName = mrName.toLowerCase().trim();
          
          for (let [key, staff] of staffMap.entries()) {
            if (staff.originalName && staff.originalName.toLowerCase().trim() === normalizedMRName) {
              staffDetails = staff;
              break;
            }
          }
        }

        // Check what MRId we should use
        let mrIdToUse = "N/A";
        if (staffDetails?.MRId) {
          mrIdToUse = staffDetails.MRId;
        } else if (item.medicalRepId) {
          mrIdToUse = item.medicalRepId.toString();
        } else if (item._id) {
          mrIdToUse = typeof item._id === 'object' ? item._id.toString() : item._id;
        }
        
        const record = {
          mrId: mrIdToUse,
          mrName: staffDetails?.originalName || mrName,
          contactNo: staffDetails?.contactNo || "N/A",
          email: staffDetails?.email || "N/A",
          teamName: staffDetails?.teamName || "N/A",
          zone: item.zone || "N/A",
          newCustomers: item.newCustomers,
          date: item.latestDate
            ? new Date(item.latestDate).toLocaleDateString()
            : new Date().toLocaleDateString(),
          medicalRepId: item.medicalRepId ? item.medicalRepId.toString() : "N/A"
        };
        return record;
      });

      totalRecords = result.totalCount[0]?.total || 0;
    } else {
      const allStaff = await Staff.find({ enabled: true }).lean();
      const staffMap = new Map();
      allStaff.forEach((staff) => {
        if (staff._id) {
          const staffId = staff._id.toString();
          staffMap.set(staffId, {
            MRId: staff.MRId,
            contactNo: staff.contactNo,
            email: staff.email,
            teamName: staff.teamName,
            originalName: staff.medicalRepName,
          });
        }
      });

      const aggregationPipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: { $ifNull: ["$zone", "Unknown Zone"] },
            zoneName: { $first: "$zone" },
            totalMRs: { 
              $addToSet: { 
                $ifNull: [
                  { $toString: "$medicalRepId" }, 
                  { $ifNull: ["$medicalRepName", "Unknown MR"] }
                ] 
              } 
            },
            newCustomers: { $sum: 1 },
            latestDate: { $max: "$createdAt" },
            medicalRepIds: { $addToSet: "$medicalRepId" },
          },
        },
        {
          $project: {
            zoneName: { $ifNull: ["$zoneName", "Unknown Zone"] },
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
            medicalRepIds: 1,
          },
        },
        { $sort: { newCustomers: -1 } },
        {
          $facet: {
            paginatedResults: [{ $skip: skip }, { $limit: limitNum }],
            totalCount: [{ $count: "total" }],
          },
        },
      ];

      const [result] = await Customer.aggregate(aggregationPipeline);
      
      records = result.paginatedResults.map((item) => {
        let primaryContact = null;
        let contactMR = "N/A";
        let contactNo = "N/A";
        
        if (item.medicalRepIds && item.medicalRepIds.length > 0) {
          for (const medicalRepId of item.medicalRepIds) {
            if (medicalRepId) {
              const staffId = medicalRepId.toString();
              const staffDetails = staffMap.get(staffId);
              if (staffDetails && staffDetails.contactNo) {
                primaryContact = staffDetails;
                contactMR = staffDetails.originalName || "N/A";
                contactNo = staffDetails.contactNo;
                break;
              }
            }
          }
        }

        return {
          zoneId: item._id || "N/A",
          zoneName: item.zoneName || "Unknown Zone",
          totalMRs: item.totalMRs || 0,
          newCustomers: item.newCustomers || 0,
          averagePerMR: item.averagePerMR || 0,
          contactNo: contactNo,
          contactMR: contactMR,
          date: item.latestDate
            ? new Date(item.latestDate).toLocaleDateString()
            : new Date().toLocaleDateString(),
        };
      });

      totalRecords = result.totalCount[0]?.total || 0;
    }

    // Get summary statistics with null handling
    const summaryResult = await Customer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalNewCustomers: { $sum: 1 },
          totalMRs: { 
            $addToSet: { 
              $ifNull: [
                { $toString: "$medicalRepId" }, 
                { $ifNull: ["$medicalRepName", "Unknown MR"] }
              ] 
            } 
          },
          totalZones: { $addToSet: { $ifNull: ["$zone", "Unknown Zone"] } },
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
    console.error("🔍 Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to fetch new customer data",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export default router;