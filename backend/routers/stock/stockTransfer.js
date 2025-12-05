import express from "express";
import mongoose from "mongoose";
import StockTransfer from "../../models/stock/stockTransfer.js";
import StockTransferToMR from "../../models/stock/stockTransferToMR.js"; // ADD THIS
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
    if (boxQuantity <= 0) return 0;

    const existingProduct = await ReportInHand.findOne({ productName }).session(session);
    if (!existingProduct) {
      console.warn(
        `⚠️ Product "${productName}" not found in ReportInHand inventory`
      );
      return 0;
    }

    // Check if quantity exists and has boxes property
    if (!existingProduct.quantity || typeof existingProduct.quantity !== 'object') {
      throw new Error(`Invalid quantity structure for product "${productName}"`);
    }

    const currentBoxes = existingProduct.quantity.boxes || 0;

    console.log("existingProduct", existingProduct, "Current boxes:", currentBoxes);

    // Check stock availability for send transfers
    if (transferType === "send" && currentBoxes < boxQuantity) {
      throw new Error(
        `Insufficient stock for "${productName}". Available: ${currentBoxes}, Required: ${boxQuantity}`
      );
    }

    // Determine change direction
    const quantityChange = transferType === "send" ? -boxQuantity : boxQuantity;

    const updatedBoxes = currentBoxes + quantityChange;

    // Determine new stock status
    let updatedStatus = "In Stock";
    if (updatedBoxes <= 0) updatedStatus = "Out of Stock";
    else if (updatedBoxes < 10) updatedStatus = "Critical";
    else if (updatedBoxes < 25) updatedStatus = "Low Stock";

    const updateData = {
      $set: {
        "quantity.boxes": updatedBoxes,
        status: updatedStatus,
      },
    };

    if (session) {
      await ReportInHand.findByIdAndUpdate(existingProduct._id, updateData, { session });
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
   🔹 POST: Create New Stock Transfer (Fixed Version)
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

    console.log('Received stock transfer request:', req.body);

    if (!invoiceNo || !date || !items || !status || !transferType) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
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
      return res
        .status(400)
        .json({ success: false, message: "At least one item is required" });
    }

    // First, check all products and their availability
    for (const item of items) {
      if (!item.productId || !item.productName) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Each item must have productId and productName",
        });
      }

      // Check if product exists
      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productName}`,
        });
      }

      // For send transfers, check inventory availability
      if (transferType === "send") {
        const existingProduct = await ReportInHand.findOne({
          productName: item.productName,
        }).session(session);
        
        console.log(`Checking inventory for ${item.productName}:`, existingProduct);
        
        if (!existingProduct) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Product "${item.productName}" not found in inventory`,
          });
        }

        // Check if product has quantity structure
        if (!existingProduct.quantity || typeof existingProduct.quantity !== 'object') {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Invalid inventory data for product "${item.productName}"`,
          });
        }

        const availableBoxes = existingProduct.quantity.boxes || 0;
        
        console.log(`Available boxes for ${item.productName}: ${availableBoxes}, Requested: ${item.boxQuantity}`);
        
        if (availableBoxes < item.boxQuantity) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${item.productName}. Available: ${availableBoxes}, Required: ${item.boxQuantity}`,
          });
        }
      }
    }

    // Create the stock transfer document
    const stockTransfer = new StockTransfer({
      invoiceNo,
      date: new Date(date),
      items: items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        boxQuantity: parseFloat(item.boxQuantity),
        expenses: parseFloat(item.expenses || 0),
        lc: parseFloat(item.lc || 0),
      })),
      remarks: remarks || "",
      status,
      transferType,
      shipping: parseFloat(shipping || 0),
      totalExpenses: parseFloat(totalExpenses || 0),
      grandTotal: parseFloat(grandTotal || 0),
      destination: destination || "",
      source: source || "",
    });

    // Save the stock transfer
    const savedTransfer = await stockTransfer.save({ session });

    // Update inventory for each item
    for (const item of items) {
      await updateReportInHandAfterStockTransfer(
        item.productName,
        parseFloat(item.boxQuantity),
        transferType,
        session
      );
    }

    // Commit transaction
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
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating stock transfer:", error);
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

    const existingProduct = await ReportInHand.findOne({ productName });
    if (!existingProduct) return;

    // Reverse the previous operation
    const quantityChange = transferType === "send" ? boxQuantity : -boxQuantity;
    const updatedBoxes = existingProduct.quantity.boxes + quantityChange;

    // Determine new stock status
    let updatedStatus = "In Stock";
    if (updatedBoxes <= 0) updatedStatus = "Out of Stock";
    else if (updatedBoxes < 10) updatedStatus = "Critical";
    else if (updatedBoxes < 25) updatedStatus = "Low Stock";

    await ReportInHand.findByIdAndUpdate(existingProduct._id, {
      $set: {
        "quantity.boxes": updatedBoxes,
        status: updatedStatus,
      },
    });
  } catch (error) {
    console.error(
      `❌ Error restoring ReportInHand for product "${productName}":`,
      error.message
    );
    throw error;
  }
};

/* ==========================================================================
   🔹 GET: Last Stock Transfer Number
   ========================================================================== */
router.get("/stock-transfers/last-number", async (req, res) => {
  try {
    // Use imported models directly
    const lastGeneralTransfer = await StockTransfer.findOne()
      .sort({ invoiceNo: -1 })
      .select("invoiceNo");

    const lastMRTransfer = await StockTransferToMR.findOne()
      .sort({ invoiceNo: -1 })
      .select("invoiceNo");

    // Function to extract number from invoiceNo
    const extractNumber = (invoiceNo) => {
      if (!invoiceNo) return 0;
      const match = invoiceNo.match(/ST-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    // Get numbers from both
    const generalNumber = extractNumber(lastGeneralTransfer?.invoiceNo);
    const mrNumber = extractNumber(lastMRTransfer?.invoiceNo);

    // Get the highest number
    const lastNumber = Math.max(generalNumber, mrNumber);

    res.json({ success: true, lastNumber });
  } catch (error) {
    console.error("Error fetching last stock transfer number:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching last stock transfer number",
    });
  }
});
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
   🔹 GET: All Stock Transfers (With Pagination & Filters)
   ========================================================================== */
router.get("/stock-transfers", async (req, res) => {
  try {
    const {
      type,
      page = 1,
      limit = 10,
      search,
      status,
      paymentStatus,
    } = req.query;
    const filter = {};

    if (type && type !== "all") filter.transferType = type;
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: "i" } },
        { destination: { $regex: search, $options: "i" } },
        { source: { $regex: search, $options: "i" } },
        { remarks: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [transfers, totalCount] = await Promise.all([
      StockTransfer.find(filter)
        .sort({ createdAt: -1 })
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
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .populate("items.productId", "productName sku category");

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

    if (!invoiceNo || !date || !items || !status || !transferType) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
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
      return res
        .status(400)
        .json({ success: false, message: "At least one item is required" });
    }

    for (const item of items) {
      if (!item.productId || !item.productName) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Each item must have productId and productName",
        });
      }

      const product = await Product.findById(item.productId);
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
          productName: item.productName,
        });
        
        if (!existingProduct) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Product "${item.productName}" not found in inventory`,
          });
        }

        const availableQuantity = existingProduct.quantity || 
                                 (existingProduct.quantity && existingProduct.quantity.boxes) || 
                                 (existingProduct.boxes) || 
                                 (existingProduct.stock) || 
                                 0;
                
        if (availableQuantity < item.boxQuantity) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${item.productName}. Available: ${availableQuantity}, Required: ${item.boxQuantity}`,
          });
        }
      }
    }

    const stockTransfer = new StockTransfer({
      invoiceNo,
      date: new Date(date),
      items: items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        boxQuantity: parseFloat(item.boxQuantity),
        expenses: parseFloat(item.expenses),
        lc: parseFloat(item.lc || 0), 
      })),
      remarks: remarks || "",
      status,
      transferType,
      shipping: parseFloat(shipping || 0),
      totalExpenses: parseFloat(totalExpenses || 0),
      grandTotal: parseFloat(grandTotal || 0),
      destination: destination || "",
      source: source || "",
    });

    const savedTransfer = await stockTransfer.save({ session });

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
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating stock transfer:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
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
   🔹 DELETE: Bulk Delete Stock Transfers
   ========================================================================== */
router.delete("/stock-transfers/bulk/delete", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "No stock transfer IDs provided" });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));

    if (invalidIds.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid ID(s) provided",
        invalidIds,
      });
    }

    const transfers = await StockTransfer.find({ _id: { $in: validIds } });

    for (const transfer of transfers) {
      for (const item of transfer.items) {
        await restoreReportInHandAfterStockTransferDeletion(
          item.productName,
          parseFloat(item.boxQuantity),
          transfer.transferType
        );
      }
    }

    const result = await StockTransfer.deleteMany(
      { _id: { $in: validIds } },
      { session }
    );

    if (result.deletedCount === 0) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "No stock transfers found to delete",
      });
    }

    await session.commitTransaction();
    session.endSession();

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
      message: "Server error during bulk delete",
      error: error.message,
    });
  }
});

export default router;
