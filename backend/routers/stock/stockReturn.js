import express from "express";
import mongoose from "mongoose";
import StockReturn from "../../models/stock/StockReturn.js";
import StockInMrHand from "../../models/stock/StockInMRHand.js";
import MRCash from "../../models/accounts/MRCash.js";
import MR from "../../models/staffMember/staff.js";

const router = express.Router();

/**
 * Generate unique return ID with format: SR + YY + MM + 0001
 */
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

/**
 * Clean string helper - removes extra spaces and special characters
 */
const cleanString = (str) => {
  if (!str) return "";
  return str
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .toLowerCase();
};

/**
 * Find MR data with fallback logic
 */
const findMR = async (returnItem) => {
  const mrName = returnItem.mrName?.trim();

  if (!mrName) {
    return null;
  }

  let mrCashData = null;

  try {
    mrCashData = await MRCash.findOne({
      mrName: mrName,
      isActive: true,
    })
      .select("currentCash mrCode mrName")
      .lean();
  } catch (err) {
    console.error("Error finding MR cash data:", err);
  }

  return mrCashData;
};

// ==================== GET / ====================
router.get("/", async (req, res) => {
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
      if (startDate) query.returnDate.$gte = new Date(startDate);
      if (endDate) query.returnDate.$lte = new Date(endDate);
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const stockReturns = await StockReturn.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .lean();

    const enhancedReturns = await Promise.all(
      stockReturns.map(async (item) => {
        try {
          const mrCashData = await findMR(item);
          return {
            ...item,
            currentCash: mrCashData?.currentCash || 0,
            mrCashDetails: mrCashData || null,
          };
        } catch (err) {
          console.error("Error enhancing MR data:", err);
          return {
            ...item,
            currentCash: 0,
            mrCashDetails: null,
          };
        }
      })
    );

    const total = await StockReturn.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: enhancedReturns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching stock returns:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stock returns",
      error: error.message,
    });
  }
});

// ==================== GET /statistics ====================
router.get("/statistics", async (req, res) => {
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
    console.error("Error fetching statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
});

// ==================== GET /:id ====================
router.get("/:id", async (req, res) => {
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
      .lean();

    if (!stockReturn) {
      return res.status(404).json({
        success: false,
        message: "Stock return not found",
      });
    }

    const mrCashData = await findMR(stockReturn);

    const enhancedReturn = {
      ...stockReturn,
      currentCash: mrCashData?.currentCash || 0,
      mrDetails: mrCashData,
    };

    return res.status(200).json({
      success: true,
      data: enhancedReturn,
    });
  } catch (error) {
    console.error("Error fetching stock return:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch stock return",
      error: error.message,
    });
  }
});

// ==================== POST / ====================
router.post("/", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrId, mrName, items, remarks, returnDate } = req.body;

    if (!mrId || !items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Medical Representative ID and items are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(mrId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid Medical Representative ID format",
      });
    }

    let mrInfo = null;
    let mrNameToUse = mrName;

    if (mrId) {
      mrInfo = await MR.findOne({ _id: mrId }).session(session);
      if (mrInfo) {
        mrNameToUse = mrInfo.mrName || mrName;
      }
    }

    if (!mrNameToUse) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Medical Representative name is required",
      });
    }

    let mrStock = await StockInMrHand.findOne({ mrId: mrId }).session(session);

    if (!mrStock) {
      mrStock = await StockInMrHand.findOne({ mrName: mrNameToUse }).session(
        session
      );
    }

    if (!mrStock) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `No stock found for Medical Representative: ${mrNameToUse}`,
      });
    }

    const returnItems = [];
    const stockInMrUpdates = [];
    let totalQuantity = 0;
    let totalValue = 0;

    for (const [index, item] of items.entries()) {
      if (!item.productId || !item.returnQty || item.returnQty <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Invalid item data at position ${
            index + 1
          }. Product ID and positive return quantity are required`,
        });
      }

      const productInMr = mrStock.productsInHand?.find((p) => {
        const productIdStr = p.productId?.toString();
        const itemProductIdStr = item.productId?.toString();
        return productIdStr === itemProductIdStr;
      });

      if (!productInMr) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Product "${
            item.productName || item.productId
          }" not found in stock for MR: ${mrNameToUse}`,
        });
      }

      const availableQuantity = productInMr.quantity || 0;

      if (availableQuantity < item.returnQty) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${
            item.productName || productInMr.productName
          }". Available: ${availableQuantity}, Requested: ${item.returnQty}`,
        });
      }

      const returnItem = {
        productId: productInMr.productId,
        stockRecordId: productInMr._id,
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
        costPrice: item.costPrice || productInMr.costPrice || 0,
        unit: productInMr.unit || item.unit || "box",
      };

      returnItems.push(returnItem);
      totalQuantity += returnItem.returnQty;
      totalValue += returnItem.returnQty * returnItem.costPrice;

      stockInMrUpdates.push({
        updateOne: {
          filter: {
            _id: mrStock._id,
            "productsInHand._id": productInMr._id,
          },
          update: {
            $inc: { "productsInHand.$.quantity": -item.returnQty },
            $set: {
              "productsInHand.$.lastUpdated": new Date(),
              updatedAt: new Date(),
            },
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

    let mrCodeValue = "";
    if (mrInfo) {
      mrCodeValue =
        mrInfo.mrCode || `MR-${mrNameToUse.toUpperCase().slice(0, 4)}`;
    } else {
      mrCodeValue = `MR-${mrNameToUse.toUpperCase().slice(0, 4)}`;
    }

    const stockReturn = new StockReturn({
      returnId: returnId,
      mrId: new mongoose.Types.ObjectId(mrId),
      mrCode: mrCodeValue,
      mrName: mrNameToUse,
      returnDate: returnDate || new Date(),
      items: returnItems,
      totalItems: returnItems.length,
      totalQuantity: totalQuantity,
      totalValue: totalValue,
      remarks: remarks || "",
      status: "Pending",
      createdBy: createdById,
    });

    if (stockInMrUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
    }

    await stockReturn.save({ session });

    await session.commitTransaction();
    session.endSession();

    const populatedReturn = await StockReturn.findById(stockReturn._id)
      .populate("createdBy", "name email")
      .lean();

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

    console.error("Error creating stock return:", error);

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
      error: error.message,
    });
  }
});

// ==================== PUT /:id/status ====================
router.put("/:id/status", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { status, rejectedReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid stock return ID format",
      });
    }

    if (!["Pending", "Approved", "Rejected"].includes(status)) {
      await session.abortTransaction();
      session.endSession();
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
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Stock return not found",
      });
    }

    const previousStatus = stockReturn.status;
    const stockInMrUpdates = [];

    if (status === "Rejected" && previousStatus !== "Rejected") {
      for (const item of stockReturn.items) {
        stockInMrUpdates.push({
          updateOne: {
            filter: {
              mrId: stockReturn.mrId,
              "productsInHand.productId": item.productId,
            },
            update: {
              $inc: { "productsInHand.$.quantity": item.returnQty },
              $set: {
                "productsInHand.$.lastUpdated": new Date(),
                updatedAt: new Date(),
              },
            },
          },
        });
      }
    }

    if (status === "Approved" && previousStatus === "Pending") {
      for (const item of stockReturn.items) {
        stockInMrUpdates.push({
          updateOne: {
            filter: {
              mrId: stockReturn.mrId,
              "productsInHand.productId": item.productId,
            },
            update: {
              $inc: { "productsInHand.$.quantity": -item.returnQty },
              $set: {
                "productsInHand.$.lastUpdated": new Date(),
                updatedAt: new Date(),
              },
            },
          },
        });
      }
    }

    if (status === "Approved" && previousStatus === "Rejected") {
      for (const item of stockReturn.items) {
        stockInMrUpdates.push({
          updateOne: {
            filter: {
              mrId: stockReturn.mrId,
              "productsInHand.productId": item.productId,
            },
            update: {
              $inc: { "productsInHand.$.quantity": -item.returnQty },
              $set: {
                "productsInHand.$.lastUpdated": new Date(),
                updatedAt: new Date(),
              },
            },
          },
        });
      }
    }

    if (stockInMrUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
    }

    stockReturn.status = status;

    if (status === "Approved") {
      stockReturn.approvedBy = req.user?._id;
      stockReturn.approvedAt = new Date();
      stockReturn.rejectedReason = undefined;
    }

    if (status === "Rejected") {
      stockReturn.rejectedReason = rejectedReason || "No reason provided";
      stockReturn.approvedBy = undefined;
      stockReturn.approvedAt = undefined;
    }

    await stockReturn.save({ session });

    await session.commitTransaction();
    session.endSession();

    const updatedReturn = await StockReturn.findById(id)
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .lean();

    const mrCashData = await findMR(updatedReturn);

    return res.status(200).json({
      success: true,
      message: `Stock return ${status.toLowerCase()} successfully`,
      data: {
        ...updatedReturn,
        currentCash: mrCashData?.currentCash || 0,
        mrDetails: mrCashData,
      },
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    console.error("Error updating stock return status:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update stock return status",
      error: error.message,
    });
  }
});

// ==================== DELETE /:id ====================
router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
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
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Stock return not found",
      });
    }

    if (stockReturn.status !== "Pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Only pending stock returns can be deleted",
      });
    }

    const stockInMrUpdates = [];
    for (const item of stockReturn.items) {
      stockInMrUpdates.push({
        updateOne: {
          filter: {
            mrId: stockReturn.mrId,
            "productsInHand.productId": item.productId,
          },
          update: {
            $inc: { "productsInHand.$.quantity": item.returnQty },
            $set: {
              "productsInHand.$.lastUpdated": new Date(),
              updatedAt: new Date(),
            },
          },
        },
      });
    }

    if (stockInMrUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
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
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    console.error("Error deleting stock return:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete stock return",
      error: error.message,
    });
  }
});

// ==================== DELETE /bulk ====================
router.delete("/bulk", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      await session.abortTransaction();
      session.endSession();
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
      session.endSession();
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
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "No pending stock returns found to delete",
      });
    }

    const updatesByMR = {};
    for (const returnDoc of stockReturns) {
      for (const item of returnDoc.items) {
        const key = `${returnDoc.mrId}-${item.productId}`;
        if (!updatesByMR[key]) {
          updatesByMR[key] = {
            mrId: returnDoc.mrId,
            productId: item.productId,
            totalQty: 0,
          };
        }
        updatesByMR[key].totalQty += item.returnQty;
      }
    }

    const stockInMrUpdates = Object.values(updatesByMR).map((update) => ({
      updateOne: {
        filter: {
          mrId: update.mrId,
          "productsInHand.productId": update.productId,
        },
        update: {
          $inc: { "productsInHand.$.quantity": update.totalQty },
          $set: {
            "productsInHand.$.lastUpdated": new Date(),
            updatedAt: new Date(),
          },
        },
      },
    }));

    if (stockInMrUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
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
      deletedCount: stockReturns.length,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    console.error("Error bulk deleting stock returns:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete stock returns",
      error: error.message,
    });
  }
});

export default router;