import express from "express";
import mongoose from "mongoose";
import StockTransfer from "../../models/stock/stockTransfer.js";
import StockTransferToMR from "../../models/stock/stockTransferToMR.js";
import Product from "../../models/projectManger/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";

const router = express.Router();

const updateReportInHandAfterStockTransfer = async (
  productName,
  boxQuantity,
  transferType,
  session = null
) => {
  try {
    if (boxQuantity <= 0) {
      return 0;
    }

    // Search with case-insensitive regex since productName is stored in lowercase
    const existingProduct = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") }
    }).session(session);

    if (!existingProduct) {
      return 0;
    }

    const currentBoxes = existingProduct.totalBoxes || 0;

    if (transferType === "send" && currentBoxes < boxQuantity) {
      throw new Error(
        `Insufficient stock for "${productName}". Available: ${currentBoxes}, Required: ${boxQuantity}`
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
          updatedBatches[0].boxes + quantityChange
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
      error.message
    );
    throw error;
  }
};

/* ==========================================================================
   🔹 POST: Create New Stock Transfer
   ========================================================================== */
router.post("/stock-transfers", async (req, res) => {
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

    // Validate required fields
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

    // Validate items
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

      // Inventory check for send transfers
      if (transferType === "send") {
        // Use case-insensitive search for productName
        const existingProduct = await ReportInHand.findOne({
          productName: { $regex: new RegExp(`^${item.productName}$`, "i") }
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

    // Prepare items with proper data types
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

    // Create stock transfer
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

    // Update inventory
    for (const item of items) {
      await updateReportInHandAfterStockTransfer(
        item.productName,
        parseFloat(item.boxQuantity),
        transferType,
        session
      );
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: `Stock transfer ${
        transferType === "send" ? "sent" : "received"
      } successfully`,
      data: savedTransfer,
    });
  } catch (error) {
    console.error("❌ Error in stock transfer:", error);
    await session.abortTransaction();
    session.endSession();

    // Handle duplicate invoice number
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

const restoreReportInHandAfterStockTransferDeletion = async (
  productName,
  boxQuantity,
  transferType
) => {
  try {
    if (boxQuantity <= 0) return;

    // Use case-insensitive search for productName
    const existingProduct = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") }
    });
    
    if (!existingProduct) return;

    // Reverse the previous operation
    const quantityChange = transferType === "send" ? boxQuantity : -boxQuantity;
    const currentBoxes = existingProduct.totalBoxes || 0;
    const updatedBoxes = currentBoxes + quantityChange;

    // Determine new stock status
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
          updatedBatches[0].boxes + quantityChange
        );
      }
      updateData.$set.batches = updatedBatches;
    }

    await ReportInHand.findByIdAndUpdate(existingProduct._id, updateData);
  } catch (error) {
    console.error(
      `❌ Error restoring ReportInHand for product "${productName}":`,
      error.message
    );
    throw error;
  }
};

/* ==========================================================================
   🔹 GET: Next Stock Transfer Number
   ========================================================================== */
router.get("/stock-transfers/next-number", async (req, res) => {
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
      const num = match ? parseInt(match[1], 10) : 0;
      return num;
    };

    const generalNumber = extractNumber(lastGeneralTransfer?.invoiceNo);
    const mrNumber = extractNumber(lastMRTransfer?.invoiceNo);
    const lastNumber = Math.max(generalNumber, mrNumber);
    const nextNumber = lastNumber + 1;
    const nextInvoiceNo = `ST-${nextNumber.toString().padStart(4, "0")}`;

    res.json({
      success: true,
      lastNumber,
      nextNumber: nextInvoiceNo,
    });
  } catch (error) {
    console.error("❌ Error generating next stock transfer number:", error);
    res.status(500).json({
      success: false,
      message: "Error generating next stock transfer number",
      error: error.message,
    });
  }
});

/* ==========================================================================
   🔹 GET: All Stock Transfers
   ========================================================================== */
router.get("/stock-transfers", async (req, res) => {
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

/* ==========================================================================
   🔹 GET: Single Stock Transfer by ID
   ========================================================================== */
router.get("/stock-transfers/:id", async (req, res) => {
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

/* ==========================================================================
   🔹 PUT: Update Existing Stock Transfer
   ========================================================================== */
router.put("/stock-transfers/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Invalid stock transfer ID" });
    }

    const transfer = await StockTransfer.findById(id);
    if (!transfer) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Stock transfer not found" });
    }

    const updateData = { ...req.body };

    if (updateData.transferType === "send" && !updateData.destination) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Destination is required for send transfers",
      });
    }

    if (updateData.transferType === "receive" && !updateData.source) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Source is required for receive transfers",
      });
    }

    // Restore previous inventory first
    for (const oldItem of transfer.items) {
      await restoreReportInHandAfterStockTransferDeletion(
        oldItem.productName,
        parseFloat(oldItem.boxQuantity),
        transfer.transferType
      );
    }

    // Apply new inventory update
    if (updateData.items) {
      for (const newItem of updateData.items) {
        await updateReportInHandAfterStockTransfer(
          newItem.productName,
          parseFloat(newItem.boxQuantity),
          updateData.transferType
        );
      }
    }

    // Prepare items with proper data types
    if (updateData.items) {
      updateData.items = updateData.items.map((item) => ({
        ...item,
        boxQuantity: parseFloat(item.boxQuantity) || 0,
        expenses: parseFloat(item.expenses) || 0,
        lc: parseFloat(item.lc) || 0,
        quantity: item.quantity || {
          boxes: parseFloat(item.boxQuantity) || 0,
          strips: 0,
          pieces: 0,
          totalPieces: parseFloat(item.boxQuantity) || 0,
        },
      }));
    }

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Stock transfer updated successfully",
      data: updatedTransfer,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating stock transfer:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating stock transfer",
      error: error.message,
    });
  }
});

/* ==========================================================================
   🔹 DELETE: Single Stock Transfer
   ========================================================================== */
router.delete("/stock-transfers/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Invalid stock transfer ID" });
    }

    const transfer = await StockTransfer.findById(id);
    if (!transfer) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Stock transfer not found" });
    }

    for (const item of transfer.items) {
      await restoreReportInHandAfterStockTransferDeletion(
        item.productName,
        parseFloat(item.boxQuantity),
        transfer.transferType
      );
    }

    const deletedTransfer = await StockTransfer.findByIdAndDelete(id, {
      session,
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Stock transfer deleted successfully",
      data: deletedTransfer,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting stock transfer:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting stock transfer",
      error: error.message,
    });
  }
});

/* ==========================================================================
   🔹 GET: Stock Transfer Summary/Stats
   ========================================================================== */
router.get("/stock-transfers/summary", async (req, res) => {
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

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching stock transfer summary:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching summary",
      error: error.message,
    });
  }
});

export default router;