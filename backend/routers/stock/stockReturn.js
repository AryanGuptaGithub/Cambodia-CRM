import express from "express";
import mongoose from "mongoose";
import StockReturn from "../../models/stock/StockReturn.js";
import StockInMrHand from "../../models/stock/stockInMRHand.js";
import MRCash from "../../models/accounts/MRCash.js";
import MR from "../../models/staffMember/staff.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";
import { emitEvent, EVENT_TYPES, captureSnapshotBefore } from "../../observability/auditLogger.js";

const router = express.Router();

// ==================== HELPERS ====================

const generateReturnId = async () => {
  const prefix = "SR";
  const year = new Date().getFullYear().toString().slice(-2);
  const month = (new Date().getMonth() + 1).toString().padStart(2, "0");
  const lastReturn = await StockReturn.findOne({
    returnId: new RegExp(`^${prefix}${year}${month}`),
  }).sort({ returnId: -1 });
  let sequence = 1;
  if (lastReturn?.returnId) {
    const lastSeq = parseInt(lastReturn.returnId.slice(-4));
    sequence = lastSeq + 1;
  }
  return `${prefix}${year}${month}${sequence.toString().padStart(4, "0")}`;
};

const findMR = async (returnItem) => {
  const mrName = returnItem.mrName?.trim();
  if (!mrName) return null;
  try {
    return await MRCash.findOne({ mrName, isActive: true })
      .select("currentCash mrCode mrName")
      .lean();
  } catch (err) {
    console.error("Error finding MR cash data:", err);
    return null;
  }
};

const getProductsFromMRStock = (mrStock) => {
  if (!mrStock) return [];
  return (
    mrStock.productsInHand ||
    mrStock.products ||
    mrStock.stock ||
    mrStock.items ||
    []
  );
};

const getProductQuantity = (product) =>
  product.quantity ??
  product.stock ??
  product.qty ??
  product.availableQty ??
  product.count ??
  0;

const extractCostPrice = (product) => {
  const candidates = [
    product.lc,
    product.costPrice,
    product.price,
    product.unitCost,
    product.cost,
  ];
  for (const val of candidates) {
    if (val !== null && val !== undefined && val !== "") {
      const num = Number(val);
      if (isFinite(num) && num >= 0) return num;
    }
  }
  return 0;
};

const getProductName = (product) =>
  product.productName ||
  product.name ||
  product.product_name ||
  "Unknown Product";

// ==================== ROUTES ====================

// GET ALL STOCK RETURNS
router.get("/", protect, async (req, res) => {
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
    if (mrCode) query.mrCode = mrCode;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.returnDate = {};
      if (startDate) query.returnDate.$gte = new Date(startDate);
      if (endDate) query.returnDate.$lte = new Date(endDate);
    }
    const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [stockReturns, total] = await Promise.all([
      StockReturn.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .populate("createdBy", "name email")
        .populate("approvedBy", "name email")
        .lean(),
      StockReturn.countDocuments(query),
    ]);
    const enhancedReturns = await Promise.all(
      stockReturns.map(async (item) => {
        try {
          const mrCashData = await findMR(item);
          return {
            ...item,
            currentCash: mrCashData?.currentCash || 0,
            mrCashDetails: mrCashData || null,
          };
        } catch {
          return { ...item, currentCash: 0, mrCashDetails: null };
        }
      }),
    );
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
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch stock returns",
        error: error.message,
      });
  }
});

// GET STATISTICS
router.get("/statistics", protect, async (req, res) => {
  try {
    const { mrCode, startDate, endDate } = req.query;
    const matchStage = { isDeleted: false };
    if (mrCode) matchStage.mrCode = mrCode;
    if (startDate || endDate) {
      matchStage.returnDate = {};
      if (startDate) matchStage.returnDate.$gte = new Date(startDate);
      if (endDate) matchStage.returnDate.$lte = new Date(endDate);
    }
    const [stats, monthlyStats, mrStats] = await Promise.all([
      StockReturn.aggregate([
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
      ]),
      StockReturn.aggregate([
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
      ]),
      StockReturn.aggregate([
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
      ]),
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
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch statistics",
        error: error.message,
      });
  }
});

// GET MR STOCK BY MR ID
router.get("/mr-stock/:mrId", protect, async (req, res) => {
  try {
    const { mrId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(mrId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid MR ID format" });
    }

    let mrStock = await StockInMrHand.findOne({ mrId }).lean();
    if (!mrStock) mrStock = await StockInMrHand.findById(mrId).lean();
    if (!mrStock) {
      return res
        .status(404)
        .json({ success: false, message: "No stock record found for this MR" });
    }

    const productsInHand = mrStock.productsInHand || [];

    const availableProducts = productsInHand
      .filter((p) => (p.quantity ?? p.stock ?? 0) > 0)
      .map((p) => {
        const costPrice = extractCostPrice(p);
        return {
          _id: p._id,
          productId: p.productId || p._id,
          productName: p.productName || p.name || "Unknown Product",
          quantity: p.quantity ?? p.stock ?? 0,
          lc: costPrice,
          costPrice: costPrice,
          batch: p.batch || "N/A",
          expiry: p.expiry || null,
          unit: p.unit || "box",
        };
      });

    return res.status(200).json({
      success: true,
      data: {
        mrId: mrStock.mrId,
        mrName: mrStock.mrName,
        totalAmount: mrStock.totalAmount,
        totalProductCost: mrStock.totalProductCost,
        productsInHand: availableProducts,
        totalAvailableProducts: availableProducts.length,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch MR stock",
        error: error.message,
      });
  }
});

// BULK DELETE (with observability)
router.delete("/bulk/delete", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const snapshotBefore = await captureSnapshotBefore();
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
          success: false,
          message: "Please provide stock return IDs to delete",
        });
    }
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
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
      return res
        .status(404)
        .json({
          success: false,
          message: "No pending stock returns found to delete",
        });
    }

    // Capture data for logging
    const deletedRecords = stockReturns.map(r => r.toObject());

    const updatesByMR = {};
    for (const returnDoc of stockReturns) {
      const key = returnDoc.mrId.toString();
      if (!updatesByMR[key])
        updatesByMR[key] = {
          mrId: returnDoc.mrId,
          products: {},
          totalValue: 0,
        };
      for (const item of returnDoc.items) {
        const productKey = item.productId.toString();
        if (!updatesByMR[key].products[productKey])
          updatesByMR[key].products[productKey] = {
            productId: item.productId,
            totalQty: 0,
          };
        updatesByMR[key].products[productKey].totalQty += item.returnQty;
        updatesByMR[key].totalValue +=
          item.returnQty * Number(item.costPrice || 0);
      }
    }
    for (const mrKey in updatesByMR) {
      const updateData = updatesByMR[mrKey];
      const mrStock = await StockInMrHand.findOne({
        mrId: updateData.mrId,
      }).session(session);
      if (mrStock) {
        const productsInHand = getProductsFromMRStock(mrStock);
        const stockInMrUpdates = [];
        for (const productKey in updateData.products) {
          const productUpdate = updateData.products[productKey];
          const productIndex = productsInHand.findIndex(
            (p) =>
              p.productId?.toString() === productUpdate.productId?.toString(),
          );
          if (productIndex !== -1) {
            stockInMrUpdates.push({
              updateOne: {
                filter: { _id: mrStock._id },
                update: {
                  $inc: {
                    [`productsInHand.${productIndex}.quantity`]:
                      productUpdate.totalQty,
                  },
                  $set: { updatedAt: new Date() },
                },
              },
            });
          }
        }
        if (stockInMrUpdates.length > 0) {
          await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
          await StockInMrHand.updateOne(
            { _id: mrStock._id },
            {
              $inc: {
                totalAmount: updateData.totalValue,
                totalProductCost: updateData.totalValue,
              },
            },
            { session },
          );
        }
      }
    }
    await StockReturn.updateMany(
      { _id: { $in: validIds } },
      { $set: { isDeleted: true } },
      { session },
    );
    await session.commitTransaction();
    session.endSession();

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${stockReturns.length} Stock Return(s)`,
      tableName: "stockreturns",
      tableLabel: "Stock Return",
      previousData: deletedRecords,
      description: `Deleted ${stockReturns.length} pending stock returns. IDs: ${validIds.join(", ")}`,
    });

    await emitEvent(req, {
      eventType: EVENT_TYPES.STOCK_RETURNED,
      entityType: 'StockReturn',
      status: 'SUCCESS',
      metadata: { action: 'BULK_DELETE', count: stockReturns.length, ids: validIds, snapshotBefore },
    });

    return res.status(200).json({
      success: true,
      message: `${stockReturns.length} stock return(s) deleted successfully`,
      deletedCount: stockReturns.length,
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    await emitEvent(req, {
      eventType: EVENT_TYPES.STOCK_RETURNED,
      status: 'FAILED',
      errorMessage: error.message,
    });
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete stock returns",
        error: error.message,
      });
  }
});

// GET SINGLE STOCK RETURN
router.get("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid stock return ID format" });
    }
    const stockReturn = await StockReturn.findOne({ _id: id, isDeleted: false })
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .lean();
    if (!stockReturn) {
      return res
        .status(404)
        .json({ success: false, message: "Stock return not found" });
    }
    const mrCashData = await findMR(stockReturn);
    return res.status(200).json({
      success: true,
      data: {
        ...stockReturn,
        currentCash: mrCashData?.currentCash || 0,
        mrDetails: mrCashData,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch stock return",
        error: error.message,
      });
  }
});

// CREATE STOCK RETURN (with observability)
router.post("/", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const snapshotBefore = await captureSnapshotBefore();
  try {
    const { mrId, mrName, items, remarks, returnDate } = req.body;

    if (!mrId || !items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
          success: false,
          message: "Medical Representative ID and items are required",
        });
    }
    if (!mongoose.Types.ObjectId.isValid(mrId)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid Medical Representative ID format",
        });
    }

    const mrInfo = await MR.findById(mrId).session(session);
    const mrNameToUse = mrInfo?.medicalRepName || mrInfo?.mrName || mrName;
    if (!mrNameToUse) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
          success: false,
          message: "Medical Representative name is required",
        });
    }

    let mrStock = await StockInMrHand.findOne({ mrId }).session(session);
    if (!mrStock && mrInfo?.mrCode)
      mrStock = await StockInMrHand.findOne({ mrCode: mrInfo.mrCode }).session(
        session,
      );
    if (!mrStock)
      mrStock = await StockInMrHand.findOne({ mrName: mrNameToUse }).session(
        session,
      );
    if (!mrStock)
      mrStock = await StockInMrHand.findOne({
        mrName: { $regex: new RegExp(`^${mrNameToUse}$`, "i") },
      }).session(session);
    if (!mrStock) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `No stock record found for Medical Representative: ${mrNameToUse}.`,
      });
    }

    const productsInHand = getProductsFromMRStock(mrStock);
    if (!productsInHand || productsInHand.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({
          success: false,
          message: `No products found in stock for MR: ${mrNameToUse}.`,
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
          message: `Invalid item at position ${index + 1}: productId and positive returnQty required.`,
        });
      }

      const productInMr = productsInHand.find((p) => {
        const pProductId = p.productId?.toString();
        const itemProductId = item.productId?.toString();
        const pId = p._id?.toString();
        return pProductId === itemProductId || pId === itemProductId;
      });

      if (!productInMr) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Product "${item.productName || item.productId}" not found in MR stock.`,
        });
      }

      const availableQuantity = getProductQuantity(productInMr);
      const returnQtyNum = parseInt(item.returnQty, 10);
      if (availableQuantity < returnQtyNum) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${getProductName(productInMr)}". Available: ${availableQuantity}, Requested: ${returnQtyNum}`,
        });
      }

      const costPrice =
        item.costPrice !== undefined &&
        item.costPrice !== null &&
        item.costPrice !== ""
          ? Number(item.costPrice)
          : extractCostPrice(productInMr);

      const productName = item.productName || getProductName(productInMr);

      const returnItem = {
        productId: productInMr.productId || productInMr._id,
        stockRecordId: productInMr._id,
        productCode:
          item.productCode ||
          productInMr.productCode ||
          `PROD-${(productInMr.productId || productInMr._id).toString().slice(-6)}`,
        productName,
        batch: item.batch || productInMr.batch || "N/A",
        expiry: item.expiry || productInMr.expiry || null,
        returnQty: returnQtyNum,
        returnDate: item.returnDate || returnDate || new Date(),
        remarks: item.remarks || "",
        costPrice,
        unit: productInMr.unit || item.unit || "box",
      };

      returnItems.push(returnItem);
      totalQuantity += returnItem.returnQty;
      totalValue += returnItem.returnQty * returnItem.costPrice;

      const productIndex = productsInHand.findIndex(
        (p) => p._id?.toString() === productInMr._id?.toString(),
      );
      if (productIndex !== -1) {
        stockInMrUpdates.push({
          updateOne: {
            filter: { _id: mrStock._id },
            update: {
              $inc: {
                [`productsInHand.${productIndex}.quantity`]: -returnQtyNum,
              },
              $set: { updatedAt: new Date() },
            },
          },
        });
      }
    }

    const returnId = await generateReturnId();
    const createdById =
      req.user?._id || new mongoose.Types.ObjectId("000000000000000000000001");
    const mrCodeValue =
      mrInfo?.mrCode || `MR-${mrNameToUse.toUpperCase().slice(0, 4)}`;

    const stockReturn = new StockReturn({
      returnId,
      mrId: new mongoose.Types.ObjectId(mrId),
      mrCode: mrCodeValue,
      mrName: mrNameToUse,
      returnDate: returnDate || new Date(),
      items: returnItems,
      totalItems: returnItems.length,
      totalQuantity,
      totalValue,
      remarks: remarks || "",
      status: "Pending",
      createdBy: createdById,
    });

    if (stockInMrUpdates.length > 0) {
      await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
      await StockInMrHand.updateOne(
        { _id: mrStock._id },
        {
          $inc: { totalAmount: -totalValue, totalProductCost: -totalValue },
          $set: { updatedAt: new Date() },
        },
        { session },
      );
    }

    await stockReturn.save({ session });
    await session.commitTransaction();
    session.endSession();

    const populatedReturn = await StockReturn.findById(stockReturn._id)
      .populate("createdBy", "name email")
      .lean();

    // Log activity
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Stock Return: ${returnId}`,
      tableName: "stockreturns",
      tableLabel: "Stock Return",
      recordId: stockReturn._id,
      referenceNumber: returnId,
      newData: {
        returnId,
        mrName: mrNameToUse,
        totalItems: returnItems.length,
        totalQuantity,
        totalValue,
        remarks: remarks || "",
      },
      description: `Created stock return for ${mrNameToUse} with ${returnItems.length} items, total quantity ${totalQuantity}, value ${totalValue}`,
      refField: "mrId",
    });

    await emitEvent(req, {
      eventType: EVENT_TYPES.STOCK_RETURNED,
      entityType: 'StockReturn',
      entityId: stockReturn._id?.toString(),
      status: 'SUCCESS',
      metadata: { returnId, mrName: mrNameToUse, totalValue, snapshotBefore },
    });

    return res
      .status(201)
      .json({
        success: true,
        message: "Stock return created successfully",
        data: populatedReturn,
      });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    await emitEvent(req, {
      eventType: EVENT_TYPES.STOCK_RETURNED,
      status: 'FAILED',
      errorMessage: error.message,
    });
    if (error.name === "ValidationError") {
      const validationErrors = {};
      for (const field in error.errors)
        validationErrors[field] = error.errors[field].message;
      return res
        .status(400)
        .json({
          success: false,
          message: "Validation failed",
          errors: validationErrors,
        });
    }
    if (error.code === 11000) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Duplicate return ID. Please try again.",
        });
    }
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to create stock return",
        error: error.message,
      });
  }
});

// UPDATE STATUS (with observability)
router.put("/:id/status", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const snapshotBefore = await captureSnapshotBefore();
  try {
    const { id } = req.params;
    const { status, rejectedReason } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid stock return ID format" });
    }
    if (!["Pending", "Approved", "Rejected"].includes(status)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
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
      return res
        .status(404)
        .json({ success: false, message: "Stock return not found" });
    }
    const previousStatus = stockReturn.status;
    const previousRecord = stockReturn.toObject();

    if (status === "Rejected" && previousStatus === "Pending") {
      const mrStock = await StockInMrHand.findOne({
        mrId: stockReturn.mrId,
      }).session(session);
      if (mrStock) {
        const productsInHand = getProductsFromMRStock(mrStock);
        const stockInMrUpdates = [];
        for (const item of stockReturn.items) {
          const productIndex = productsInHand.findIndex(
            (p) => p.productId?.toString() === item.productId?.toString(),
          );
          if (productIndex !== -1) {
            stockInMrUpdates.push({
              updateOne: {
                filter: { _id: mrStock._id },
                update: {
                  $inc: {
                    [`productsInHand.${productIndex}.quantity`]: item.returnQty,
                  },
                  $set: { updatedAt: new Date() },
                },
              },
            });
          }
        }
        if (stockInMrUpdates.length > 0) {
          await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
          await StockInMrHand.updateOne(
            { _id: mrStock._id },
            {
              $inc: {
                totalAmount: stockReturn.totalValue,
                totalProductCost: stockReturn.totalValue,
              },
            },
            { session },
          );
        }
      }
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

    // Log activity
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Stock Return ${status}: ${stockReturn.returnId}`,
      tableName: "stockreturns",
      tableLabel: "Stock Return",
      recordId: stockReturn._id,
      referenceNumber: stockReturn.returnId,
      previousData: previousRecord,
      newData: {
        status,
        rejectedReason: status === "Rejected" ? rejectedReason : undefined,
        approvedBy: status === "Approved" ? req.user?._id : undefined,
        approvedAt: status === "Approved" ? new Date() : undefined,
      },
      description: `Changed status of return ${stockReturn.returnId} from ${previousStatus} to ${status}`,
      refField: "mrId",
    });

    await emitEvent(req, {
      eventType: EVENT_TYPES.STOCK_RETURNED,
      entityType: 'StockReturn',
      entityId: stockReturn._id?.toString(),
      status: 'SUCCESS',
      metadata: { returnId: stockReturn.returnId, oldStatus: previousStatus, newStatus: status, snapshotBefore },
    });

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
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    await emitEvent(req, {
      eventType: EVENT_TYPES.STOCK_RETURNED,
      status: 'FAILED',
      errorMessage: error.message,
    });
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to update stock return status",
        error: error.message,
      });
  }
});

// DELETE SINGLE STOCK RETURN (with observability)
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const snapshotBefore = await captureSnapshotBefore();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid stock return ID format" });
    }
    const stockReturn = await StockReturn.findOne({
      _id: id,
      isDeleted: false,
    }).session(session);
    if (!stockReturn) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Stock return not found" });
    }
    if (stockReturn.status !== "Pending") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
          success: false,
          message: "Only pending stock returns can be deleted",
        });
    }
    const previousRecord = stockReturn.toObject();

    const mrStock = await StockInMrHand.findOne({
      mrId: stockReturn.mrId,
    }).session(session);
    if (mrStock) {
      const productsInHand = getProductsFromMRStock(mrStock);
      const stockInMrUpdates = [];
      for (const item of stockReturn.items) {
        const productIndex = productsInHand.findIndex(
          (p) => p.productId?.toString() === item.productId?.toString(),
        );
        if (productIndex !== -1) {
          stockInMrUpdates.push({
            updateOne: {
              filter: { _id: mrStock._id },
              update: {
                $inc: {
                  [`productsInHand.${productIndex}.quantity`]: item.returnQty,
                },
                $set: { updatedAt: new Date() },
              },
            },
          });
        }
      }
      if (stockInMrUpdates.length > 0) {
        await StockInMrHand.bulkWrite(stockInMrUpdates, { session });
        await StockInMrHand.updateOne(
          { _id: mrStock._id },
          {
            $inc: {
              totalAmount: stockReturn.totalValue,
              totalProductCost: stockReturn.totalValue,
            },
          },
          { session },
        );
      }
    }
    stockReturn.isDeleted = true;
    await stockReturn.save({ session });
    await session.commitTransaction();
    session.endSession();

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Stock Return: ${stockReturn.returnId}`,
      tableName: "stockreturns",
      tableLabel: "Stock Return",
      recordId: stockReturn._id,
      referenceNumber: stockReturn.returnId,
      previousData: previousRecord,
      description: `Deleted pending stock return ${stockReturn.returnId} for MR ${stockReturn.mrName}`,
      refField: "mrId",
    });

    await emitEvent(req, {
      eventType: EVENT_TYPES.STOCK_RETURNED,
      entityType: 'StockReturn',
      entityId: stockReturn._id?.toString(),
      status: 'SUCCESS',
      metadata: { returnId: stockReturn.returnId, mrName: stockReturn.mrName, snapshotBefore },
    });

    return res
      .status(200)
      .json({ success: true, message: "Stock return deleted successfully" });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    await emitEvent(req, {
      eventType: EVENT_TYPES.STOCK_RETURNED,
      status: 'FAILED',
      errorMessage: error.message,
    });
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete stock return",
        error: error.message,
      });
  }
});

export default router;