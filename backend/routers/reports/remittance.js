import express from "express";
import Category from "../../models/accounts/CategoryType.js";
import Transaction from "../../models/accounts/Transaction.js"; // Import Transaction model
import Supplier from "../../models/master/supplier.js"; // Import Supplier model

const router = express.Router();

router.get("/reports/remittance", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      page = 1,
      limit = 7,
      search,
      period,
      year,
      month,
      supplierId,
    } = req.query;

    // First, get the remittance category ID
    const remittanceCategory = await Category.findOne({ code: "remittance" });

    if (!remittanceCategory) {
      return res.status(404).json({
        success: false,
        message: "Remittance category not found",
      });
    }

    const matchStage = {
      categoryType: remittanceCategory._id,
    };

    // Handle supplier filter
    if (supplierId) {
      matchStage.supplier = supplierId;
    }

    // Handle period filtering
    if (period || year || month) {
      matchStage.date = {};

      let start, end;

      if (period === "monthly" && year && month) {
        start = new Date(year, month - 1, 1);
        end = new Date(year, month, 0);
        end.setHours(23, 59, 59, 999);
      } else if (period === "quarterly" && year) {
        const quarter = Math.floor((month - 1) / 3);
        start = new Date(year, quarter * 3, 1);
        end = new Date(year, (quarter + 1) * 3, 0);
        end.setHours(23, 59, 59, 999);
      } else if (period === "yearly" && year) {
        start = new Date(year, 0, 1);
        end = new Date(year, 11, 31);
        end.setHours(23, 59, 59, 999);
      }

      if (start && end) {
        matchStage.date.$gte = start;
        matchStage.date.$lte = end;
      }
    }

    // Handle custom date range
    if (startDate || endDate) {
      matchStage.date = matchStage.date || {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format",
          });
        }
        matchStage.date.$gte = start;
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
        matchStage.date.$lte = end;
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build aggregation pipeline with grouping by supplier
    const pipeline = [
      { $match: matchStage },
      // Lookup supplier details first for grouping
      {
        $lookup: {
          from: "suppliers",
          localField: "supplier",
          foreignField: "_id",
          as: "supplierInfo",
        },
      },
      {
        $unwind: {
          path: "$supplierInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Group by supplier
      {
        $group: {
          _id: "$supplier",
          supplierName: { $first: "$supplierInfo.name" },
          supplierCode: { $first: "$supplierInfo.code" },
          totalRemittanceAmount: { $sum: "$amount" },
          totalFinalAmount: { $sum: "$finalAmount" },
          totalExchangeLoss: { $sum: "$exchangeLoss" },
          transactionCount: { $sum: 1 },
          latestTransactionDate: { $max: "$date" },
          transactions: { $push: "$$ROOT" },
        },
      },
      // Lookup category details for the grouped records
      {
        $lookup: {
          from: "categories",
          localField: "transactions.categoryType",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      // Lookup source and destination for the grouped records
      {
        $lookup: {
          from: "accounts",
          localField: "transactions.source",
          foreignField: "_id",
          as: "sourceInfo",
        },
      },
      {
        $lookup: {
          from: "accounts",
          localField: "transactions.destination",
          foreignField: "_id",
          as: "destinationInfo",
        },
      },
    ];

    // Apply search filter after grouping
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      pipeline.push({
        $match: {
          $or: [
            { supplierName: { $regex: searchRegex } },
            { supplierCode: { $regex: searchRegex } },
          ],
        },
      });
    }

    // Add count stage before pagination
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: "totalCount" });

    // Continue with main pipeline for data
    pipeline.push({ $sort: { totalRemittanceAmount: -1 } }); // Sort by highest remittance amount

    // Add facet for records and summary
    pipeline.push({
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalRemittanceAmount: { $sum: "$totalRemittanceAmount" },
              totalFinalAmount: { $sum: "$totalFinalAmount" },
              totalExchangeLoss: { $sum: "$totalExchangeLoss" },
              totalSuppliers: { $sum: 1 },
              totalTransactions: { $sum: "$transactionCount" },
            },
          },
          {
            $project: {
              _id: 0,
              totalRemittanceAmount: 1,
              totalFinalAmount: 1,
              totalExchangeLoss: 1,
              totalSuppliers: 1,
              totalTransactions: 1,
            },
          },
        ],
        records: [
          { $skip: skip },
          { $limit: limitNum },
          {
            $project: {
              _id: 0,
              supplierId: "$_id",
              supplierName: 1,
              supplierCode: 1,
              totalRemittanceAmount: 1,
              totalFinalAmount: 1,
              totalExchangeLoss: 1,
              transactionCount: 1,
              latestTransactionDate: 1,
              // Include sample transaction details for reference
              sampleInvoice: {
                $arrayElemAt: ["$transactions.invoiceNumber", 0],
              },
              sampleCustomer: {
                $arrayElemAt: ["$transactions.customerName", 0],
              },
              categoryName: { $arrayElemAt: ["$categoryInfo.name", 0] },
            },
          },
        ],
      },
    });

    // Execute both pipelines
    const [aggregationResult, countResult] = await Promise.all([
      Transaction.aggregate(pipeline),
      Transaction.aggregate(countPipeline),
    ]);

    const result = aggregationResult[0];
    const summary = result.summary[0] || {
      totalRemittanceAmount: 0,
      totalFinalAmount: 0,
      totalExchangeLoss: 0,
      totalSuppliers: 0,
      totalTransactions: 0,
    };

    const records = result.records;

    const totalCount = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    return res.json({
      success: true,
      data: {
        summary: {
          ...summary,
          totalRecords: totalCount,
        },
        records: records,
      },
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      count: records.length,
    });
  } catch (error) {
    console.error("Error in remittance report:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching remittance data",
      error: error.message,
    });
  }
});

export default router;
