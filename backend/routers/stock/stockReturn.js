import express from "express";
import mongoose from "mongoose";
import StockReturn from "../../models/stock/StockReturn.js";
import StockInMrHand from "../../models/stock/StockInMRHand.js";
import MRCash from "../../models/accounts/MRCash.js";
import MR from "../../models/staffMember/staff.js"; // Add this import - adjust path as needed

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

// Clean string helper
const cleanString = (str) => {
  if (!str) return "";
  return str
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .toLowerCase();
};

// Find MR data with fallback logic
const findMR = async (returnItem) => {
  const mrName = returnItem.mrName?.trim();

  if (!mrName) {
    return null;
  }

  let mrCashData = null;

  try {
    // First try exact match
    mrCashData = await MRCash.findOne({
      mrName: mrName,
      isActive: true,
    })
      .select("currentCash mrCode mrName")
      .lean();
  } catch (err) {
    console.error("Try 1 Error:", err);
  }

  return mrCashData;
};

// Get all stock returns
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

    // Search filter
    if (search) {
      query.$or = [
        { returnId: { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
        { mrCode: { $regex: search, $options: "i" } },
      ];
    }

    // MR Code filter
    if (mrCode) {
      query.mrCode = mrCode;
    }

    // Status filter
    if (status) {
      query.status = status;
    }

    // Date range filter
    if (startDate || endDate) {
      query.returnDate = {};
      if (startDate) query.returnDate.$gte = new Date(startDate);
      if (endDate) query.returnDate.$lte = new Date(endDate);
    }

    // Sorting options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch stock returns
    const stockReturns = await StockReturn.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .lean();

    // Enhance returns with MR Cash details
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

// Get single stock return
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
      .lean();

    if (!stockReturn) {
      return res.status(404).json({
        success: false,
        message: "Stock return not found",
      });
    }

    // Get MR data
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

// Update stock return status - FIXED VERSION
router.put("/stock-returns/:id/status", async (req, res) => {
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

    // If trying to approve but MR doesn't exist in MRCash
      // if (status === "Approved") {
      //   const mrCashData = await MRCash.findOne({
      //     mrName: stockReturn.mrName,
      //     isActive: true,
      //   }).session(session);

      //   if (!mrCashData) {
      //     await session.abortTransaction();
      //     session.endSession();
      //     return res.status(400).json({
      //       success: false,
      //       message: `MR ${stockReturn.mrName} not found in active MR list`,
      //     });
      //   }
      // }

    const stockUpdates = [];
    const stockInMrUpdates = [];
    const mrCashUpdates = [];

    // Handle Rejected status
    if (status === "Rejected" && previousStatus !== "Rejected") {
      // Restore stock quantities in StockInMrHand
      for (const item of stockReturn.items) {
        stockInMrUpdates.push({
          updateOne: {
            filter: { 
              mrName: stockReturn.mrName,
              "products.productId": item.productId 
            },
            update: {
              $inc: { "products.$.boxQuantity": item.returnQty },
              $set: { updatedAt: new Date() },
            },
          },
        });

        // If previously approved, restore MR stock
        if (previousStatus === "Approved") {
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
    }

    // Handle Approved status
    if (status === "Approved" && previousStatus === "Pending") {
      // Deduct from MR's stock in StockInMrHand
      for (const item of stockReturn.items) {
        stockInMrUpdates.push({
          updateOne: {
            filter: { 
              mrName: stockReturn.mrName,
              "products.productId": item.productId 
            },
            update: {
              $inc: { "products.$.boxQuantity": -item.returnQty },
              $set: { updatedAt: new Date() },
            },
          },
        });

        // Add to main stock
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

    // Handle Approved after Rejected
    if (status === "Approved" && previousStatus === "Rejected") {
      for (const item of stockReturn.items) {
        // Deduct from MR's stock again
        stockInMrUpdates.push({
          updateOne: {
            filter: { 
              mrName: stockReturn.mrName,
              "products.productId": item.productId 
            },
            update: {
              $inc: { "products.$.boxQuantity": -item.returnQty },
              $set: { updatedAt: new Date() },
            },
          },
        });

        // Add to main stock
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

    // Execute updates if any
    if (stockUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockUpdates, { session });
    }

    if (stockInMrUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
    }

    // Update stock return status
    stockReturn.status = status;

    if (status === "Approved") {
      stockReturn.approvedBy = req.user?._id;
      stockReturn.approvedAt = new Date();
      stockReturn.rejectedReason = undefined;
    }

    if (status === "Rejected") {
      stockReturn.rejectedReason = rejectedReason || "No reason provided";
    }

    await stockReturn.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Fetch updated data
    const updatedReturn = await StockReturn.findById(id)
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .lean();

    // Get MR cash data
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
    await session.abortTransaction();
    session.endSession();

    console.error("Error updating stock return status:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update stock return status",
      error: error.message,
    });
  }
});

// Delete stock return
router.delete("/stock-returns/:id", async (req, res) => {
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

    // Restore stock quantities in StockInMrHand
    const stockInMrUpdates = [];
    for (const item of stockReturn.items) {
      stockInMrUpdates.push({
        updateOne: {
          filter: { 
            mrName: stockReturn.mrName,
            "products.productId": item.productId 
          },
          update: {
            $inc: { "products.$.boxQuantity": item.returnQty },
            $set: { updatedAt: new Date() },
          },
        },
      });
    }

    if (stockInMrUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
    }

    // Mark as deleted
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

    console.error("Error deleting stock return:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete stock return",
      error: error.message,
    });
  }
});

// Bulk delete stock returns
router.delete("/stock-returns/bulk", async (req, res) => {
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

    // Group updates by MR name
    const updatesByMR = {};
    for (const returnDoc of stockReturns) {
      for (const item of returnDoc.items) {
        const key = `${returnDoc.mrName}-${item.productId}`;
        if (!updatesByMR[key]) {
          updatesByMR[key] = {
            mrName: returnDoc.mrName,
            productId: item.productId,
            totalQty: 0,
          };
        }
        updatesByMR[key].totalQty += item.returnQty;
      }
    }

    // Create bulk update operations
    const stockInMrUpdates = Object.values(updatesByMR).map((update) => ({
      updateOne: {
        filter: { 
          mrName: update.mrName,
          "products.productId": update.productId 
        },
        update: {
          $inc: { "products.$.boxQuantity": update.totalQty },
          $set: { updatedAt: new Date() },
        },
      },
    }));

    if (stockInMrUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
    }

    // Mark as deleted
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

    console.error("Error bulk deleting stock returns:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete stock returns",
      error: error.message,
    });
  }
});

// Get MR stock
router.get("/mr-stock/:mrName", async (req, res) => {
  try {
    let { mrName } = req.params;
    mrName = mrName.replace(/\s+/g, ' ').trim();
    const stockRecord = await StockInMrHand.findOne({
      mrName: { $regex: new RegExp(`^${mrName}$`, 'i') }
    }).populate("products.productId", "productName productCode");
    
    if (!stockRecord) {
      return res.status(200).json({
        success: true,
        data: [],
        message: `No stock found for MR: ${mrName}`
      });
    }

    if (!stockRecord.products || stockRecord.products.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: `No products in stock for MR: ${mrName}`
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
    console.error("Error fetching MR stock:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch MR stock",
      error: error.message,
    });
  }
});

// Get statistics
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
    console.error("Error fetching statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
});

// Create stock return
router.post("/stock-returns", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrName, items, remarks, returnDate } = req.body;
    console.log('values of req.body', req.body);
    if (!mrName || !items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Medical Representative name and items are required",
      });
    }

    const mrStock = await StockInMrHand.findOne({ mrName: mrName }).session(session);

    if (!mrStock) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "No stock found for this MR",
      });
    }

    const returnItems = [];
    const stockInMrUpdates = [];
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

      const productInMr = mrStock.products?.find(
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
          }" not found in stock for MR: ${mrName}`,
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
        stockRecordId: item.stockRecordId,
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

      // Prepare update for StockInMrHand
      stockInMrUpdates.push({
        updateOne: {
          filter: {
            _id: mrStock._id,
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

    const stockReturn = new StockReturn({
      returnId: returnId,
      mrId: mrCash._id,
      mrCode: mrCash.mrCode || `MR-${mrCash.mrName.toUpperCase().slice(0, 4)}-${mrCash._id
        .toString()
        .slice(-4)}`,
      mrName: mrName,
      returnDate: returnDate || new Date(),
      items: returnItems,
      totalItems: returnItems.length,
      totalQuantity: totalQuantity,
      totalValue: totalValue,
      remarks: remarks || "",
      status: "Pending",
      createdBy: createdById,
    });

    // Execute stock updates
    if (stockInMrUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
    }

    // Save stock return
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

export default router;