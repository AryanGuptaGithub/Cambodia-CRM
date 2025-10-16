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
        $match: matchStage
      },
      {
        $lookup: {
          from: "customers", // MongoDB collection name (usually lowercase plural of Customer)
          localField: "customerCode", // Field in SaleSummary collection
          foreignField: "customerCode", // Field in Customer collection
          as: "customerInfo"
        }
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true // Include sales even if customer not found
        }
      },
      {
        $sort: { deliveryDate: 1 }
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
          mrName: 1
        }
      }
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

export default router;