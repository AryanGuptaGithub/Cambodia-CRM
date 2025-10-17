import express from 'express';
import SaleSummary from '../../models/sale/saleSummary.js';
import Staff from '../../models/staffMember/staff.js';

const router = express.Router();

// MR Wise Outstanding Route
router.get('/mr-wise-outstanding', async (req, res) => {
  try {
    const { page = 1, limit = 7, search, startDate, endDate } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build match conditions
    const matchConditions = {
      dueAmount: { $gt: 0 }
    };
    
    if (startDate && endDate) {
      matchConditions.invoiceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (search) {
      matchConditions.mrName = { $regex: search, $options: 'i' };
    }

    // Create base pipeline for data aggregation
    const basePipeline = [
      {
        $match: matchConditions
      },
      {
        $lookup: {
          from: "staff",
          let: { mrName: "$mrName" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$medicalRepName", "$$mrName"] },
                enabled: true
              }
            },
            {
              $project: {
                contactNumber: "$contactNo",
                email: 1,
                _id: 0
              }
            }
          ],
          as: "staffDetails"
        }
      },
      {
        $group: {
          _id: "$mrName",
          totalOutstandingAmount: { $sum: "$dueAmount" },
          uniqueCustomers: { $addToSet: "$customerCode" },
          staffDetails: { $first: "$staffDetails" }
        }
      },
      {
        $project: {
          mrName: "$_id",
          totalOutstandingAmount: { $round: ["$totalOutstandingAmount", 2] },
          totalCustomers: { $size: "$uniqueCustomers" },
          contactNumber: {
            $ifNull: [
              { $arrayElemAt: ["$staffDetails.contactNumber", 0] },
              "Not Available"
            ]
          },
          email: {
            $ifNull: [
              { $arrayElemAt: ["$staffDetails.email", 0] },
              "Not Available"
            ]
          },
          _id: 0
        }
      },
      {
        $sort: { totalOutstandingAmount: -1 }
      }
    ];

    // Get total count for pagination
    const countPipeline = [...basePipeline];
    countPipeline.push({ $count: "totalCount" });
    
    const countResult = await SaleSummary.aggregate(countPipeline);
    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    // Get paginated data
    const dataPipeline = [...basePipeline];
    dataPipeline.push(
      { $skip: skip },
      { $limit: limitNum }
    );

    const mrData = await SaleSummary.aggregate(dataPipeline);

    // Format records with mrId
    const records = mrData.map((mr, index) => ({
      mrId: `MR${String(skip + index + 1).padStart(3, '0')}`,
      mrName: mr.mrName,
      totalOutstandingAmount: mr.totalOutstandingAmount,
      totalCustomers: mr.totalCustomers,
      contactNumber: mr.contactNumber,
      email: mr.email
    }));

    // Calculate summary
    const summaryPipeline = [
      {
        $match: matchConditions
      },
      {
        $group: {
          _id: "$mrName",
          totalOutstandingAmount: { $sum: "$dueAmount" },
          uniqueCustomers: { $addToSet: "$customerCode" }
        }
      },
      {
        $group: {
          _id: null,
          totalOutstandingAmount: { $sum: { $round: ["$totalOutstandingAmount", 2] } },
          totalCustomers: { $sum: { $size: "$uniqueCustomers" } },
          totalMRs: { $sum: 1 }
        }
      }
    ];

    const summaryResult = await SaleSummary.aggregate(summaryPipeline);
    const summary = summaryResult[0] ? {
      totalOutstandingAmount: summaryResult[0].totalOutstandingAmount,
      totalCustomers: summaryResult[0].totalCustomers,
      totalMRs: summaryResult[0].totalMRs
    } : {
      totalOutstandingAmount: 0,
      totalCustomers: 0,
      totalMRs: 0
    };

    const response = {
      data: {
        summary,
        records
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching MR-wise outstanding:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

export default router;

