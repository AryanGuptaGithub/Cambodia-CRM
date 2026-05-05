import express from "express";
import mongoose from "mongoose";
import StockTransfer from "../../models/stock/stockTransfer.js";
import StockTransferToMR from "../../models/stock/stockTransferToMR.js";
import Product from "../../models/projectManger/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";
import { emitEvent, EVENT_TYPES } from "../../observability/auditLogger.js";

const router = express.Router();

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const updateReportInHandAfterStockTransfer = async (
  productName,
  boxQuantity,
  transferType,
  session = null,
) => {
  try {
    if (boxQuantity <= 0) {
      return 0;
    }

    const existingProduct = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    }).session(session);

    if (!existingProduct) {
      return 0;
    }

    const currentBoxes = existingProduct.totalBoxes || 0;

    if (transferType === "send" && currentBoxes < boxQuantity) {
      throw new Error(
        `Insufficient stock for "${productName}". Available: ${currentBoxes}, Required: ${boxQuantity}`,
      );
    }

    const quantityChange = transferType === "send" ? -boxQuantity : boxQuantity;
    const updatedBoxes = currentBoxes + quantityChange;

    let updatedStatus = "In Stock";
    if (updatedBoxes <= 0) updatedStatus = "Out of Stock";
    else if (updatedBoxes < 10) updatedStatus = "Critical";
    else if (updatedBoxes < 25) updatedStatus = "Low Stock";

    const updateData = {
      $set: {
        totalBoxes: updatedBoxes,
        status: updatedStatus,
      },
    };

    if (existingProduct.batches && existingProduct.batches.length > 0) {
      const updatedBatches = [...existingProduct.batches];
      if (updatedBatches[0]) {
        updatedBatches[0].boxes = Math.max(
          0,
          updatedBatches[0].boxes + quantityChange,
        );
      }
      updateData.$set.batches = updatedBatches;
    }

    if (session) {
      await ReportInHand.findByIdAndUpdate(existingProduct._id, updateData, {
        session,
      });
    } else {
      await ReportInHand.findByIdAndUpdate(existingProduct._id, updateData);
    }

    return existingProduct.lc || 0;
  } catch (error) {
    console.error(
      `❌ Error updating ReportInHand for product "${productName}":`,
      error.message,
    );
    throw error;
  }
};

const restoreReportInHandAfterStockTransferDeletion = async (
  productName,
  boxQuantity,
  transferType,
) => {
  try {
    if (boxQuantity <= 0) return;

    const existingProduct = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    });

    if (!existingProduct) return;

    const quantityChange = transferType === "send" ? boxQuantity : -boxQuantity;
    const currentBoxes = existingProduct.totalBoxes || 0;
    const updatedBoxes = currentBoxes + quantityChange;

    let updatedStatus = "In Stock";
    if (updatedBoxes <= 0) updatedStatus = "Out of Stock";
    else if (updatedBoxes < 10) updatedStatus = "Critical";
    else if (updatedBoxes < 25) updatedStatus = "Low Stock";

    const updateData = {
      $set: {
        totalBoxes: updatedBoxes,
        status: updatedStatus,
      },
    };

    if (existingProduct.batches && existingProduct.batches.length > 0) {
      const updatedBatches = [...existingProduct.batches];
      if (updatedBatches[0]) {
        updatedBatches[0].boxes = Math.max(
          0,
          updatedBatches[0].boxes + quantityChange,
        );
      }
      updateData.$set.batches = updatedBatches;
    }

    await ReportInHand.findByIdAndUpdate(existingProduct._id, updateData);
  } catch (error) {
    console.error(
      `❌ Error restoring ReportInHand for product "${productName}":`,
      error.message,
    );
    throw error;
  }
};

router.get("/next-number", async (req, res) => {
  try {
    const lastGeneralTransfer = await StockTransfer.findOne()
      .sort({ invoiceNo: -1 })
      .select("invoiceNo");

    const lastMRTransfer = await StockTransferToMR.findOne()
      .sort({ invoiceNo: -1 })
      .select("invoiceNo");

    const extractNumber = (invoiceNo) => {
      if (!invoiceNo) return 0;
      const match = invoiceNo.match(/ST-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    const generalNumber = extractNumber(lastGeneralTransfer?.invoiceNo);
    const mrNumber = extractNumber(lastMRTransfer?.invoiceNo);
    const lastNumber = Math.max(generalNumber, mrNumber);
    const nextNumber = lastNumber + 1;
    const nextInvoiceNo = `ST-${nextNumber.toString().padStart(4, "0")}`;

    res.json({ success: true, lastNumber, nextNumber: nextInvoiceNo });
  } catch (error) {
    console.error("❌ Error generating next stock transfer number:", error);
    res.status(500).json({
      success: false,
      message: "Error generating next stock transfer number",
      error: error.message,
    });
  }
});

router.get("/summary/stats", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let matchStage = {};

    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    const summary = await StockTransfer.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$transferType",
          count: { $sum: 1 },
          totalBoxes: { $sum: { $sum: "$items.boxQuantity" } },
          totalExpenses: { $sum: "$totalExpenses" },
          totalGrandTotal: { $sum: "$grandTotal" },
        },
      },
    ]);

    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error("Error fetching stock transfer summary:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching summary",
      error: error.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const { type, page = 1, limit = 10, search, status } = req.query;
    const filter = {};

    if (type && type !== "all") filter.transferType = type;
    if (status) filter.status = status;

    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: "i" } },
        { destination: { $regex: search, $options: "i" } },
        { source: { $regex: search, $options: "i" } },
        { remarks: { $regex: search, $options: "i" } },
        { "items.productName": { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [transfers, totalCount] = await Promise.all([
      StockTransfer.find(filter)
        .sort({ createdAt: -1 })
        .populate("items.productId", "productName")
        .limit(limitNum)
        .skip(skip)
        .lean(),
      StockTransfer.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: transfers,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalItems: totalCount,
        itemsPerPage: limitNum,
      },
    });
  } catch (error) {
    console.error("Error fetching stock transfers:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching stock transfers",
      error: error.message,
    });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid stock transfer ID" });
  }

  try {
    const transfer = await StockTransfer.findById(id)
      .populate("items.productId", "productName sku category")
      .lean();

    if (!transfer)
      return res
        .status(404)
        .json({ success: false, message: "Stock transfer not found" });

    res.status(200).json({ success: true, data: transfer });
  } catch (error) {
    console.error("Error fetching stock transfer:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching stock transfer",
      error: error.message,
    });
  }
});

router.post("/", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      invoiceNo,
      date,
      items,
      remarks,
      status,
      transferType,
      shipping,
      totalExpenses,
      grandTotal,
      destination,
      source,
    } = req.body;

    if (!invoiceNo || !date || !items || !status || !transferType) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: invoiceNo, date, items, status, or transferType",
      });
    }

    if (transferType === "send" && !destination) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Destination is required for send transfers",
      });
    }

    if (transferType === "receive" && !source) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Source is required for receive transfers",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "At least one item is required",
      });
    }

    for (const item of items) {
      if (
        !item.productId ||
        !item.productName ||
        item.boxQuantity === undefined
      ) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message:
            "Each item must have productId, productName, and boxQuantity",
        });
      }

      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productName}`,
        });
      }

      if (transferType === "send") {
        const existingProduct = await ReportInHand.findOne({
          productName: { $regex: new RegExp(`^${item.productName}$`, "i") },
        }).session(session);

        if (!existingProduct) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Product "${item.productName}" not found in inventory`,
          });
        }

        const availableBoxes = existingProduct.totalBoxes || 0;
        const requestedQuantity = parseFloat(item.boxQuantity) || 0;

        if (availableBoxes < requestedQuantity) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${item.productName}. Available: ${availableBoxes}, Required: ${requestedQuantity}`,
          });
        }
      }
    }

    const preparedItems = items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      boxQuantity: parseFloat(item.boxQuantity) || 0,
      quantity: item.quantity || {
        boxes: parseFloat(item.boxQuantity) || 0,
        strips: 0,
        pieces: 0,
        totalPieces: parseFloat(item.boxQuantity) || 0,
      },
      expenses: parseFloat(item.expenses) || 0,
      lc: parseFloat(item.lc) || 0,
    }));

    const stockTransfer = new StockTransfer({
      invoiceNo,
      date: new Date(date),
      items: preparedItems,
      remarks: remarks || "",
      status,
      transferType,
      shipping: parseFloat(shipping) || 0,
      totalExpenses: parseFloat(totalExpenses) || 0,
      grandTotal: parseFloat(grandTotal) || 0,
      destination: destination || "",
      source: source || "",
    });

    const savedTransfer = await stockTransfer.save({ session });

    for (const item of items) {
      await updateReportInHandAfterStockTransfer(
        item.productName,
        parseFloat(item.boxQuantity),
        transferType,
        session,
      );
    }

    await session.commitTransaction();
    session.endSession();

    // Log activity
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `${transferType === "send" ? "Sent" : "Received"} Stock Transfer: ${invoiceNo}`,
      tableName: "stocktransfers",
      tableLabel: "Stock Transfer",
      recordId: savedTransfer._id,
      referenceNumber: invoiceNo,
      newData: {
        invoiceNo,
        transferType,
        destination: destination || source,
        itemsCount: items.length,
        totalBoxes: items.reduce(
          (sum, item) => sum + (parseFloat(item.boxQuantity) || 0),
          0,
        ),
        grandTotal: parseFloat(grandTotal) || 0,
        status,
      },
      description: `${transferType === "send" ? "Sent" : "Received"} stock transfer ${invoiceNo} - ${transferType === "send" ? "To: " + destination : "From: " + source}. Items: ${items.length}`,
      refField: "invoiceNo",
    });

    await emitEvent(req, {
      eventType:  EVENT_TYPES.STOCK_TRANSFERRED,
      entityType: 'StockTransfer',
      entityId:   savedTransfer._id?.toString(),
      status:     'SUCCESS',
      metadata: {
        invoiceNo,
        transferType,
        itemsCount:  items.length,
        grandTotal:  parseFloat(grandTotal) || 0,
        destination: destination || source,
      },
    });

    res.status(201).json({
      success: true,
      message: `Stock transfer ${transferType === "send" ? "sent" : "received"} successfully`,
      data: savedTransfer,
    });
  } catch (error) {
    console.error("❌ Error in stock transfer:", error);
    await session.abortTransaction();
    session.endSession();

    await emitEvent(req, {
      eventType:    EVENT_TYPES.STOCK_TRANSFERRED,
      status:       'FAILED',
      errorMessage: error.message,
    });

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Invoice number already exists",
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid transfer ID");
    }

    const existingTransfer = await StockTransfer.findById(id).session(session);
    if (!existingTransfer) throw new Error("Transfer not found");

    const previousData = existingTransfer.toObject();

    const {
      invoiceNo,
      date,
      items,
      remarks,
      status,
      transferType,
      shipping,
      totalExpenses,
      grandTotal,
      destination,
      source,
    } = req.body;

    if (!invoiceNo || !date || !items || !status || !transferType) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Reverse old transfer effect
    for (const item of existingTransfer.items) {
      await restoreReportInHandAfterStockTransferDeletion(
        item.productName,
        parseFloat(item.boxQuantity),
        existingTransfer.transferType,
      );
    }

    // Validate new items
    for (const item of items) {
      if (
        !item.productId ||
        !item.productName ||
        item.boxQuantity === undefined
      ) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message:
            "Each item must have productId, productName, and boxQuantity",
        });
      }

      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productName}`,
        });
      }

      if (transferType === "send") {
        const existingProduct = await ReportInHand.findOne({
          productName: { $regex: new RegExp(`^${item.productName}$`, "i") },
        }).session(session);

        if (!existingProduct) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Product "${item.productName}" not found in inventory`,
          });
        }

        const availableBoxes = existingProduct.totalBoxes || 0;
        const requestedQuantity = parseFloat(item.boxQuantity) || 0;

        if (availableBoxes < requestedQuantity) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${item.productName}. Available: ${availableBoxes}, Required: ${requestedQuantity}`,
          });
        }
      }
    }

    const preparedItems = items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      boxQuantity: parseFloat(item.boxQuantity) || 0,
      quantity: item.quantity || {
        boxes: parseFloat(item.boxQuantity) || 0,
        strips: 0,
        pieces: 0,
        totalPieces: parseFloat(item.boxQuantity) || 0,
      },
      expenses: parseFloat(item.expenses) || 0,
      lc: parseFloat(item.lc) || 0,
    }));

    const updateData = {
      invoiceNo,
      date: new Date(date),
      items: preparedItems,
      remarks: remarks || "",
      status,
      transferType,
      shipping: parseFloat(shipping) || 0,
      totalExpenses: parseFloat(totalExpenses) || 0,
      grandTotal: parseFloat(grandTotal) || 0,
      destination: destination || "",
      source: source || "",
      updatedAt: new Date(),
    };

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, session },
    );

    if (!updatedTransfer) throw new Error("Failed to update transfer");

    // Apply new transfer effect
    for (const item of items) {
      await updateReportInHandAfterStockTransfer(
        item.productName,
        parseFloat(item.boxQuantity),
        transferType,
        session,
      );
    }

    await session.commitTransaction();
    session.endSession();

    // Log activity
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Stock Transfer: ${invoiceNo}`,
      tableName: "stocktransfers",
      tableLabel: "Stock Transfer",
      recordId: updatedTransfer._id,
      referenceNumber: invoiceNo,
      previousData: {
        invoiceNo: previousData.invoiceNo,
        transferType: previousData.transferType,
        destination: previousData.destination,
        source: previousData.source,
        itemsCount: previousData.items.length,
        grandTotal: previousData.grandTotal,
      },
      newData: {
        invoiceNo,
        transferType,
        destination: destination || source,
        itemsCount: items.length,
        grandTotal: parseFloat(grandTotal) || 0,
      },
      description: `Updated stock transfer ${invoiceNo}: ${previousData.transferType} → ${transferType}`,
      refField: "invoiceNo",
    });

    await emitEvent(req, {
      eventType:  EVENT_TYPES.STOCK_TRANSFERRED,
      entityType: 'StockTransfer',
      entityId:   updatedTransfer._id?.toString(),
      status:     'SUCCESS',
      metadata:   { invoiceNo, transferType, action: 'UPDATE' },
    });

    res.json({
      success: true,
      message: "Stock transfer updated successfully",
      data: updatedTransfer,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating transfer:", error);
    res
      .status(500)
      .json({
        success: false,
        message: error.message || "Failed to update transfer",
      });
    await emitEvent(req, { eventType: EVENT_TYPES.STOCK_TRANSFERRED, status: 'FAILED', errorMessage: error.message });
  }
});

router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid stock transfer ID" });
    }

    const transfer = await StockTransfer.findById(id).session(session);
    if (!transfer) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Stock transfer not found" });
    }

    const previousData = transfer.toObject();

    for (const item of transfer.items) {
      await restoreReportInHandAfterStockTransferDeletion(
        item.productName,
        parseFloat(item.boxQuantity),
        transfer.transferType,
      );
    }

    const deletedTransfer = await StockTransfer.findByIdAndDelete(id, {
      session,
    });

    await session.commitTransaction();
    session.endSession();

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Stock Transfer: ${transfer.invoiceNo}`,
      tableName: "stocktransfers",
      tableLabel: "Stock Transfer",
      recordId: transfer._id,
      referenceNumber: transfer.invoiceNo,
      previousData: {
        invoiceNo: transfer.invoiceNo,
        transferType: transfer.transferType,
        destination: transfer.destination,
        source: transfer.source,
        items: transfer.items.map((item) => ({
          productName: item.productName,
          boxQuantity: item.boxQuantity,
        })),
        grandTotal: transfer.grandTotal,
      },
      description: `Deleted stock transfer ${transfer.invoiceNo} (${transfer.transferType})`,
      refField: "invoiceNo",
    });

    await emitEvent(req, {
      eventType:  EVENT_TYPES.STOCK_TRANSFERRED,
      entityType: 'StockTransfer',
      entityId:   req.params.id,
      status:     'SUCCESS',
      metadata:   { invoiceNo: transfer.invoiceNo, action: 'DELETE' },
    });

    res.status(200).json({
      success: true,
      message: "Stock transfer deleted successfully",
      data: deletedTransfer,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting stock transfer:", error);
    await emitEvent(req, { eventType: EVENT_TYPES.STOCK_TRANSFERRED, status: 'FAILED', errorMessage: error.message });
    res.status(500).json({
      success: false,
      message: "Server error while deleting stock transfer",
      error: error.message,
    });
  }
});

// Bulk Delete endpoint
router.delete("/", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No stock transfer IDs provided for deletion",
      });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid stock transfer IDs provided",
      });
    }

    const transfersToDelete = await StockTransfer.find({
      _id: { $in: validIds },
    }).session(session);

    if (transfersToDelete.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "No stock transfers found with the provided IDs",
      });
    }

    const previousDataArray = transfersToDelete.map((t) => ({
      invoiceNo: t.invoiceNo,
      transferType: t.transferType,
      destination: t.destination,
      source: t.source,
      itemsCount: t.items.length,
      grandTotal: t.grandTotal,
    }));

    // Restore inventory for each transfer
    for (const transfer of transfersToDelete) {
      for (const item of transfer.items) {
        await restoreReportInHandAfterStockTransferDeletion(
          item.productName,
          parseFloat(item.boxQuantity),
          transfer.transferType,
        );
      }
    }

    const result = await StockTransfer.deleteMany(
      { _id: { $in: validIds } },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Stock Transfer(s)`,
      tableName: "stocktransfers",
      tableLabel: "Stock Transfer",
      previousData: previousDataArray,
      description: `Deleted ${result.deletedCount} stock transfers. Invoices: ${transfersToDelete.map((t) => t.invoiceNo).join(", ")}`,
      refField: "invoiceNo",
    });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} stock transfer(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error bulk deleting stock transfers:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting stock transfers",
      error: error.message,
    });
  }
});

// Import stock transfers endpoint
router.post("/import", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transfers } = req.body;

    if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No stock transfers provided for import",
      });
    }

    const importedTransfers = [];
    const errors = [];
    const duplicates = [];

    for (let i = 0; i < transfers.length; i++) {
      const transfer = transfers[i];
      const rowNumber = i + 1;

      try {
        const {
          invoiceNo,
          date,
          items,
          remarks,
          status,
          transferType,
          shipping,
          totalExpenses,
          grandTotal,
          destination,
          source,
        } = transfer;

        // Validate required fields
        if (!invoiceNo || !date || !items || !status || !transferType) {
          errors.push(`Row ${rowNumber}: Missing required fields`);
          continue;
        }

        // Check for duplicate invoice number
        const existingTransfer = await StockTransfer.findOne({
          invoiceNo,
        }).session(session);
        if (existingTransfer) {
          duplicates.push({
            row: rowNumber,
            invoiceNo,
            reason: "Invoice number already exists",
          });
          continue;
        }

        if (transferType === "send" && !destination) {
          errors.push(
            `Row ${rowNumber}: Destination is required for send transfers`,
          );
          continue;
        }

        if (transferType === "receive" && !source) {
          errors.push(
            `Row ${rowNumber}: Source is required for receive transfers`,
          );
          continue;
        }

        if (!Array.isArray(items) || items.length === 0) {
          errors.push(`Row ${rowNumber}: At least one item is required`);
          continue;
        }

        // Validate items and check stock availability
        let hasError = false;
        for (const item of items) {
          if (
            !item.productId ||
            !item.productName ||
            item.boxQuantity === undefined
          ) {
            errors.push(
              `Row ${rowNumber}: Each item must have productId, productName, and boxQuantity`,
            );
            hasError = true;
            break;
          }

          const product = await Product.findById(item.productId).session(
            session,
          );
          if (!product) {
            errors.push(
              `Row ${rowNumber}: Product not found: ${item.productName}`,
            );
            hasError = true;
            break;
          }

          if (transferType === "send") {
            const existingProduct = await ReportInHand.findOne({
              productName: { $regex: new RegExp(`^${item.productName}$`, "i") },
            }).session(session);

            if (!existingProduct) {
              errors.push(
                `Row ${rowNumber}: Product "${item.productName}" not found in inventory`,
              );
              hasError = true;
              break;
            }

            const availableBoxes = existingProduct.totalBoxes || 0;
            const requestedQuantity = parseFloat(item.boxQuantity) || 0;

            if (availableBoxes < requestedQuantity) {
              errors.push(
                `Row ${rowNumber}: Insufficient stock for ${item.productName}. Available: ${availableBoxes}, Required: ${requestedQuantity}`,
              );
              hasError = true;
              break;
            }
          }
        }

        if (hasError) continue;

        const preparedItems = items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          boxQuantity: parseFloat(item.boxQuantity) || 0,
          quantity: item.quantity || {
            boxes: parseFloat(item.boxQuantity) || 0,
            strips: 0,
            pieces: 0,
            totalPieces: parseFloat(item.boxQuantity) || 0,
          },
          expenses: parseFloat(item.expenses) || 0,
          lc: parseFloat(item.lc) || 0,
        }));

        const stockTransfer = new StockTransfer({
          invoiceNo,
          date: new Date(date),
          items: preparedItems,
          remarks: remarks || "",
          status,
          transferType,
          shipping: parseFloat(shipping) || 0,
          totalExpenses: parseFloat(totalExpenses) || 0,
          grandTotal: parseFloat(grandTotal) || 0,
          destination: destination || "",
          source: source || "",
        });

        const savedTransfer = await stockTransfer.save({ session });
        importedTransfers.push(savedTransfer);

        // Update inventory
        for (const item of items) {
          await updateReportInHandAfterStockTransfer(
            item.productName,
            parseFloat(item.boxQuantity),
            transferType,
            session,
          );
        }
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }

    await session.commitTransaction();
    session.endSession();

    // Log activity
    if (importedTransfers.length > 0) {
      await logActivity(req, {
        action: "IMPORT",
        actionLabel: `Bulk Imported ${importedTransfers.length} Stock Transfer(s)`,
        tableName: "stocktransfers",
        tableLabel: "Stock Transfer",
        description: `Imported ${importedTransfers.length} stock transfers. Duplicates skipped: ${duplicates.length}. Errors: ${errors.length}.`,
        newData: {
          importedCount: importedTransfers.length,
          duplicateCount: duplicates.length,
          errorCount: errors.length,
          transfers: importedTransfers.map((t) => ({
            invoiceNo: t.invoiceNo,
            transferType: t.transferType,
          })),
        },
        refField: "invoiceNo",
      });
    }

    let message = `Successfully imported ${importedTransfers.length} stock transfer(s).`;
    if (errors.length) message += ` ${errors.length} error(s).`;
    if (duplicates.length)
      message += ` ${duplicates.length} duplicate(s) skipped.`;

    res.status(200).json({
      success: true,
      message,
      importedCount: importedTransfers.length,
      errorCount: errors.length,
      duplicateCount: duplicates.length,
      errors: errors.slice(0, 20),
      duplicates: duplicates.slice(0, 20),
      data: importedTransfers,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error importing stock transfers:", error);
    res.status(500).json({
      success: false,
      message: "Server error while importing stock transfers",
      error: error.message,
    });
  }
});

export default router;