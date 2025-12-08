import express from "express";
import mongoose from "mongoose";
import StockReturn from "../../models/stock/StockReturn.js";
import StockInMrHand from "../../models/stock/StockInMRHand.js";
import MR from "../../models/stock/stockTransferToMR.js";

const router = express.Router();

const generateReturnId = async () => {
  const prefix = "SR";
  const year = new Date().getFullYear().toString().slice(-2);
  const month = (new Date().getMonth() + 1).toString().padStart(2, "0");

  const lastReturn = await StockReturn.findOne({
    returnId: new RegExp(`^${prefix}${year}${month}`),
  }).sort({ returnId: -1 });

  let sequence = 1;
  if (lastReturn && lastReturn.returnId) {
    const lastSeq = parseInt(lastReturn.returnId.slice(-4));
    sequence = lastSeq + 1;
  }

  return `${prefix}${year}${month}${sequence.toString().padStart(4, "0")}`;
};

/* ==========================================================================
   🔹 GET: All Stock Returns
   ========================================================================== */
router.get("/stock-returns", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      mrCode,
      status,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isDeleted: false };

    if (search) {
      query.$or = [
        { returnId: { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
        { mrCode: { $regex: search, $options: "i" } },
      ];
    }

    if (mrCode) {
      query.mrCode = mrCode;
    }

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.returnDate = {};
      if (startDate) {
        query.returnDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.returnDate.$lte = new Date(endDate);
      }
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const stockReturns = await StockReturn.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    const total = await StockReturn.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: stockReturns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stock returns",
      error: error.message,
    });
  }
});

/* ==========================================================================
   🔹 GET: Stock Return by ID
   ========================================================================== */
router.get("/stock-returns/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock return ID format",
      });
    }

    const stockReturn = await StockReturn.findOne({
      _id: id,
      isDeleted: false,
    })
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("items.stockRecordId");

    if (!stockReturn) {
      return res.status(404).json({
        success: false,
        message: "Stock return not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: stockReturn,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stock return",
      error: error.message,
    });
  }
});

/* ==========================================================================
   🔹 PUT: Update Stock Return Status
   ========================================================================== */
router.put("/stock-returns/:id/status", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { status, rejectedReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid stock return ID format",
      });
    }

    if (!["Pending", "Approved", "Rejected"].includes(status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'Pending', 'Approved', or 'Rejected'",
      });
    }

    const stockReturn = await StockReturn.findOne({
      _id: id,
      isDeleted: false,
    }).session(session);

    if (!stockReturn) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Stock return not found",
      });
    }

    if (status === "Rejected" && stockReturn.status !== "Rejected") {
      const stockUpdates = [];

      for (const item of stockReturn.items) {
        stockUpdates.push({
          updateOne: {
            filter: { _id: item.stockRecordId },
            update: {
              $inc: { remainingQty: item.returnQty },
              $set: { updatedAt: new Date() },
            },
          },
        });
      }

      if (stockUpdates.length > 0) {
        await StockInMrHand.bulkWrite(stockUpdates, { session });
      }
    }

    if (status === "Approved" && stockReturn.status === "Rejected") {
      const stockUpdates = [];

      for (const item of stockReturn.items) {
        stockUpdates.push({
          updateOne: {
            filter: { _id: item.stockRecordId },
            update: {
              $inc: { remainingQty: -item.returnQty },
              $set: { updatedAt: new Date() },
            },
          },
        });
      }

      if (stockUpdates.length > 0) {
        await StockInMrHand.bulkWrite(stockUpdates, { session });
      }
    }

    stockReturn.status = status;

    if (status === "Approved") {
      stockReturn.approvedBy = req.user?._id;
      stockReturn.approvedAt = new Date();
      stockReturn.rejectedReason = undefined;
    }

    if (status === "Rejected" && rejectedReason) {
      stockReturn.rejectedReason = rejectedReason;
    }

    await stockReturn.save({ session });
    await session.commitTransaction();
    session.endSession();

    const updatedReturn = await StockReturn.findById(id)
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    return res.status(200).json({
      success: true,
      message: `Stock return ${status.toLowerCase()} successfully`,
      data: updatedReturn,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      success: false,
      message: "Failed to update stock return status",
      error: error.message,
    });
  }
});

/* ==========================================================================
   🔹 DELETE: Single Stock Return
   ========================================================================== */
router.delete("/stock-returns/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid stock return ID format",
      });
    }

    const stockReturn = await StockReturn.findOne({
      _id: id,
      isDeleted: false,
    }).session(session);

    if (!stockReturn) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Stock return not found",
      });
    }

    if (stockReturn.status !== "Pending") {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Only pending stock returns can be deleted",
      });
    }

    const stockUpdates = [];

    for (const item of stockReturn.items) {
      stockUpdates.push({
        updateOne: {
          filter: { _id: item.stockRecordId },
          update: {
            $inc: { remainingQty: item.returnQty },
            $set: { updatedAt: new Date() },
          },
        },
      });
    }

    if (stockUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockUpdates, { session });
    }

    stockReturn.isDeleted = true;
    await stockReturn.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Stock return deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      success: false,
      message: "Failed to delete stock return",
      error: error.message,
    });
  }
});

/* ==========================================================================
   🔹 DELETE: Multiple Stock Returns
   ========================================================================== */
router.delete("/stock-returns/bulk", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Please provide stock return IDs to delete",
      });
    }

    const validIds = [];
    const invalidIds = [];

    ids.forEach((id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        validIds.push(new mongoose.Types.ObjectId(id));
      } else {
        invalidIds.push(id);
      }
    });

    if (invalidIds.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid ID(s) provided",
        invalidIds,
      });
    }

    const stockReturns = await StockReturn.find({
      _id: { $in: validIds },
      isDeleted: false,
      status: "Pending",
    }).session(session);

    if (stockReturns.length === 0) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "No pending stock returns found to delete",
      });
    }

    const stockUpdates = [];

    for (const returnDoc of stockReturns) {
      for (const item of returnDoc.items) {
        stockUpdates.push({
          updateOne: {
            filter: { _id: item.stockRecordId },
            update: {
              $inc: { remainingQty: item.returnQty },
              $set: { updatedAt: new Date() },
            },
          },
        });
      }
    }

    if (stockUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockUpdates, { session });
    }

    await StockReturn.updateMany(
      { _id: { $in: validIds } },
      { $set: { isDeleted: true } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: `${stockReturns.length} stock return(s) deleted successfully`,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      success: false,
      message: "Failed to delete stock returns",
      error: error.message,
    });
  }
});

/* ==========================================================================
   🔹 GET: MR's Available Stock for Return
   ========================================================================== */
router.get("/mr-stock/:mrName", async (req, res) => {
  try {
    const { mrName } = req.params;

    const stockRecord = await StockInMrHand.findOne({
      mrName: mrName,
    }).populate("products.productId", "productName productCode");

    if (!stockRecord) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    if (!stockRecord.products || stockRecord.products.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const stockItems = stockRecord.products.map((product, index) => {
      const transformedProduct = {
        _id: product.productId?._id || product._id || `temp-${index}`,
        productId:
          product.productId?._id || product.productId || `product-${index}`,
        productCode: product.productId?.productCode || "N/A",
        productName:
          product.productId?.productName ||
          product.productName ||
          "Unknown Product",
        batch: product.batch || "N/A",
        expiry: product.expiry || "N/A",
        assignedQty: product.boxQuantity || 0,
        remainingQty: product.boxQuantity || 0,
        unit: product.unit || "box",
        costPrice: product.costPrice || 0,
        assignedDate:
          stockRecord.assignedDate || stockRecord.createdAt || new Date(),
      };

      return transformedProduct;
    });

    return res.status(200).json({
      success: true,
      data: stockItems,
      message: `Found ${stockItems.length} stock items for ${mrName}`,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch MR stock",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/* ==========================================================================
   🔹 GET: Stock Return Statistics
   ========================================================================== */
router.get("/stock-returns/statistics", async (req, res) => {
  try {
    const { mrCode, startDate, endDate } = req.query;

    const matchStage = { isDeleted: false };

    if (mrCode) {
      matchStage.mrCode = mrCode;
    }

    if (startDate || endDate) {
      matchStage.returnDate = {};
      if (startDate) matchStage.returnDate.$gte = new Date(startDate);
      if (endDate) matchStage.returnDate.$lte = new Date(endDate);
    }

    const stats = await StockReturn.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalReturns: { $sum: 1 },
          totalQuantity: { $sum: "$totalQuantity" },
          totalValue: { $sum: "$totalValue" },
          pendingReturns: {
            $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] },
          },
          approvedReturns: {
            $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] },
          },
          rejectedReturns: {
            $sum: { $cond: [{ $eq: ["$status", "Rejected"] }, 1, 0] },
          },
        },
      },
    ]);

    const monthlyStats = await StockReturn.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: "$returnDate" },
            month: { $month: "$returnDate" },
          },
          count: { $sum: 1 },
          totalQuantity: { $sum: "$totalQuantity" },
          totalValue: { $sum: "$totalValue" },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 6 },
    ]);

    const mrStats = await StockReturn.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$mrCode",
          mrName: { $first: "$mrName" },
          count: { $sum: 1 },
          totalQuantity: { $sum: "$totalQuantity" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        summary: stats[0] || {
          totalReturns: 0,
          totalQuantity: 0,
          totalValue: 0,
          pendingReturns: 0,
          approvedReturns: 0,
          rejectedReturns: 0,
        },
        monthlyStats,
        topMRs: mrStats,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
});

/* ==========================================================================
   🔹 POST: Create New Stock Return
   ========================================================================== */
router.post("/stock-returns", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrName, items, remarks, returnDate } = req.body;

    if (!mrName || !items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Medical Representative name and items are required",
      });
    }

    const mr = await StockInMrHand.findOne({ mrName: mrName }).session(session);

    if (!mr) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Medical Representative not found",
      });
    }

    const returnItems = [];
    const stockUpdates = [];
    let totalQuantity = 0;
    let totalValue = 0;

    for (const [index, item] of items.entries()) {
      if (!item.stockRecordId || !item.returnQty || item.returnQty <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Invalid item data at position ${
            index + 1
          }. Product ID and positive return quantity are required`,
        });
      }

      const productInMr = mr.products?.find(
        (p) =>
          p.productId?.toString() === item.stockRecordId ||
          p._id?.toString() === item.stockRecordId
      );

      if (!productInMr) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Product "${
            item.productName || item.stockRecordId
          }" not found in stock for MR: ${mrName}. Available products: ${
            mr.products?.map((p) => p.productName).join(", ") || "None"
          }`,
        });
      }

      if (productInMr.boxQuantity < item.returnQty) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${
            item.productName || productInMr.productName
          }". Available: ${productInMr.boxQuantity}, Requested: ${
            item.returnQty
          }`,
        });
      }

      const returnItem = {
        stockRecordId: productInMr._id,
        productId: productInMr.productId,
        productCode:
          item.productCode ||
          productInMr.productCode ||
          `PROD-${productInMr.productId.toString().slice(-6)}`,
        productName: item.productName || productInMr.productName,
        batch: item.batch || productInMr.batch || "N/A",
        expiry: item.expiry || productInMr.expiry || null,
        returnQty: Number(item.returnQty),
        returnDate: item.returnDate || new Date(),
        remarks: item.remarks || "",
        costPrice: productInMr.costPrice || item.costPrice || 10,
        unit: productInMr.unit || item.unit || "pcs",
      };

      returnItems.push(returnItem);
      totalQuantity += returnItem.returnQty;
      totalValue += returnItem.returnQty * returnItem.costPrice;

      stockUpdates.push({
        updateOne: {
          filter: {
            _id: mr._id,
            "products._id": productInMr._id,
          },
          update: {
            $inc: { "products.$.boxQuantity": -item.returnQty },
            $set: { updatedAt: new Date() },
          },
        },
      });
    }

    const returnId = await generateReturnId();

    let createdById;
    if (req.user?._id) {
      createdById = req.user._id;
    } else if (
      req.body.createdBy &&
      mongoose.Types.ObjectId.isValid(req.body.createdBy)
    ) {
      createdById = new mongoose.Types.ObjectId(req.body.createdBy);
    } else {
      createdById = new mongoose.Types.ObjectId("000000000000000000000001");
    }

    const mrCode =
      mr.mrCode ||
      `MR-${mr.mrName.toUpperCase().slice(0, 4)}-${mr._id
        .toString()
        .slice(-4)}`;

    const stockReturn = new StockReturn({
      returnId: returnId,
      mrId: mr._id,
      mrCode: mrCode,
      mrName: mr.mrName,
      returnDate: returnDate || new Date(),
      items: returnItems,
      totalItems: returnItems.length,
      totalQuantity: totalQuantity,
      totalValue: totalValue,
      remarks: remarks || "",
      status: "Pending",
      createdBy: createdById,
    });

    if (stockUpdates.length > 0) {
      for (const update of stockUpdates) {
        await StockInMrHand.updateOne(
          update.updateOne.filter,
          update.updateOne.update,
          { session }
        );
      }
    }

    await stockReturn.save({ session, validateBeforeSave: true });

    await session.commitTransaction();
    session.endSession();

    const populatedReturn = await StockReturn.findById(stockReturn._id);

    return res.status(201).json({
      success: true,
      message: "Stock return created successfully",
      data: populatedReturn,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    if (error.name === "ValidationError") {
      const validationErrors = {};
      if (error.errors) {
        for (const field in error.errors) {
          validationErrors[field] = error.errors[field].message;
        }
      }

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
        details: error.message,
      });
    }

    if (error.name === "MissingSchemaError") {
      return res.status(500).json({
        success: false,
        message: "Database configuration error. Please contact administrator.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate return ID. Please try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create stock return",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

export default router;