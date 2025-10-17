import express from "express";
import Sale from "../../models/sale/saleSummary.js";
import customer from "../../models/master/customer.js";

const router = express.Router();

router.get("/reports/cash-sales", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {
      paymentStatus: { $regex: /^cash$/i },
    };

    if (startDate || endDate) {
      matchStage.deliveryDate = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format",
          });
        }
        matchStage.deliveryDate.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate format",
          });
        }
        end.setHours(23, 59, 59, 999); // Include full day
        matchStage.deliveryDate.$lte = end;
      }
    }

    // Use aggregation with $lookup to join with Customer collection
    const sales = await Sale.aggregate([
      {
        $match: matchStage,
      },
      {
        $lookup: {
          from: "customers", // MongoDB collection name (usually lowercase plural of Customer)
          localField: "customerCode", // Field in SaleSummary collection
          foreignField: "customerCode", // Field in Customer collection
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true, // Include sales even if customer not found
        },
      },
      {
        $sort: { deliveryDate: 1 },
      },
      {
        $project: {
          _id: 1,
          date: "$deliveryDate",
          invoiceNumber: 1,
          customerName: "$customerInfo.name",
          customerCode: 1,
          productName: 1,
          salesQty: 1,
          amount: 1,
          netSellingAmount: 1,
          paymentMethod: "$paymentStatus",
          deliveryDate: 1,
          invoiceDate: 1,
          mrName: 1,
        },
      },
    ]);

    return res.json({
      success: true,
      data: sales,
      count: sales.length,
    });
  } catch (error) {
    console.error("Error in cash-sales report:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching cash sales",
      error: error.message,
    });
  }
});
router.get("/reports/outstanding-collections", async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 7, search } = req.query;

    const matchStage = {
      paymentStatus: { $regex: /^credit$/i }, // Only 'credit' payments
    };

    // Handle optional date filtering
    if (startDate || endDate) {
      matchStage.deliveryDate = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format",
          });
        }
        matchStage.deliveryDate.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate format",
          });
        }
        end.setHours(23, 59, 59, 999);
        matchStage.deliveryDate.$lte = end;
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const now = new Date();

    // Build aggregation pipeline
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Group by customer
      {
        $group: {
          _id: "$customerCode",
          customerCode: { $first: "$customerCode" },
          netSellingAmount: { $sum: "$netSellingAmount" },
          dueAmount: { $sum: "$dueAmount" },
          overdueAmount: {
            $sum: {
              $cond: [{ $lt: ["$deliveryDate", now] }, "$dueAmount", 0],
            },
          },
          latestDeliveryDate: { $max: "$deliveryDate" },
          customerInfo: { $first: "$customerInfo" },
        },
      },
    ];

    // ✅ Apply search by customer name or customer code only
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      pipeline.push({
        $match: {
          $or: [
            { "customerInfo.name": { $regex: searchRegex } },
            { customerCode: { $regex: searchRegex } },
          ],
        },
      });
    }

    // Sorting and pagination
    pipeline.push({ $sort: { latestDeliveryDate: -1 } });

    // Add facet for records and summary
    pipeline.push({
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalOutstandingAmount: { $sum: "$netSellingAmount" },
              totalDueAmount: { $sum: "$dueAmount" },
              totalOverdueAmount: { $sum: "$overdueAmount" },
              totalCustomers: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              totalOutstandingAmount: 1,
              totalDueAmount: 1,
              totalOverdueAmount: 1,
              totalCustomers: 1,
              totalRecords: "$totalCustomers",
            },
          },
        ],
        records: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              _id: 0,
              customerCode: 1,
              customerName: {
                $ifNull: ["$customerInfo.name", "$customerCode"],
              },
              phone: "$customerInfo.customerNumber",
              email: "$customerInfo.address",
              totalOutstandingAmount: "$netSellingAmount",
              dueAmount: 1,
              overdueAmount: 1,
              lastTransactionDate: "$latestDeliveryDate",
            },
          },
        ],
      },
    });

    // Execute aggregation
    const aggregationResult = await Sale.aggregate(pipeline);

    const result = aggregationResult[0];
    const summary = result.summary[0] || {
      totalOutstandingAmount: 0,
      totalDueAmount: 0,
      totalOverdueAmount: 0,
      totalCustomers: 0,
      totalRecords: 0,
    };

    const records = result.records;
    const totalPages = Math.ceil(summary.totalRecords / limitNum);
    return res.json({
      success: true,
      data: {
        summary: summary,
        records: records,
      },
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalRecords: summary.totalRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      count: records.length,
    });
  } catch (error) {
    console.error("Error in outstanding-collections report:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching outstanding collections",
      error: error.message,
    });
  }
});

export default router;
