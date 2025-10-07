import express from "express";
import mongoose from "mongoose";
import StockTransfer from "../../models/stock/stockTransfer.js";
import Product from "../../models/projectManger/product.js";

const router = express.Router();

// GET all stock transfers with filtering and pagination
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

    // Build filter object
    const filter = {};

    if (type && type !== "all") {
      filter.transferType = type;
    }

    if (status) {
      filter.status = status;
    }

    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }

    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: "i" } },
        { warehouse: { $regex: search, $options: "i" } },
        { sourceWarehouse: { $regex: search, $options: "i" } },
        { destinationWarehouse: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get transfers with pagination
    const transfers = await StockTransfer.find(filter)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .lean();

    const totalCount = await StockTransfer.countDocuments(filter);

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

// GET single stock transfer by ID
router.get("/stock-transfers/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock transfer ID",
      });
    }

    const transfer = await StockTransfer.findById(id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .populate("items.productId", "productName sku category");

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    res.status(200).json({
      success: true,
      data: transfer,
    });
  } catch (error) {
    console.error("Error fetching stock transfer:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching stock transfer",
      error: error.message,
    });
  }
});

// POST create new stock transfer
router.post("/stock-transfers", async (req, res) => {
  try {
    const {
      warehouse,
      totalAmount,
      paidAmount,
      transferType,
      items,
      sourceWarehouse,
      destinationWarehouse,
      notes,
      createdBy,
    } = req.body;

    // Generate invoice number (you need to implement this method in your model)
    const invoiceNo = `ST${Date.now()}`; // Simple invoice number generation

    const transferData = {
      invoiceNo,
      date: new Date(),
      warehouse,
      totalAmount: parseFloat(totalAmount),
      paidAmount: parseFloat(paidAmount || 0),
      transferType,
      items: items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: parseInt(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        totalPrice: parseFloat(item.quantity) * parseFloat(item.unitPrice),
      })),
      sourceWarehouse,
      destinationWarehouse,
      notes,
      createdBy: createdBy || "65d8f5c8a1b2c3e4f5g6h7i8", // Default user ID or from auth
      dueAmount: parseFloat(totalAmount) - parseFloat(paidAmount || 0),
      paymentStatus:
        paidAmount >= totalAmount
          ? "paid"
          : paidAmount > 0
          ? "partial"
          : "pending",
    };

    const transfer = new StockTransfer(transferData);
    await transfer.save();

    // Populate the created transfer
    const populatedTransfer = await StockTransfer.findById(
      transfer._id
    ).populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      data: populatedTransfer,
      message: "Stock transfer created successfully",
    });
  } catch (error) {
    console.error("Error creating stock transfer:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message:
          "Validation error: " +
          Object.values(error.errors)
            .map((e) => e.message)
            .join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while creating stock transfer",
      error: error.message,
    });
  }
});

// PUT update stock transfer
router.put("/stock-transfers/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock transfer ID",
      });
    }

    const transfer = await StockTransfer.findById(id);
    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    // Update fields
    const updateData = { ...req.body, updatedBy: "65d8f5c8a1b2c3e4f5g6h7i8" }; // From auth

    // Recalculate item totals if items are updated
    if (req.body.items) {
      updateData.items = req.body.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: parseInt(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        totalPrice: parseFloat(item.quantity) * parseFloat(item.unitPrice),
      }));
    }

    // Recalculate due amount and payment status
    if (req.body.totalAmount || req.body.paidAmount) {
      const total = parseFloat(req.body.totalAmount || transfer.totalAmount);
      const paid = parseFloat(req.body.paidAmount || transfer.paidAmount);
      updateData.dueAmount = total - paid;
      updateData.paymentStatus =
        paid >= total ? "paid" : paid > 0 ? "partial" : "pending";
    }

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    res.status(200).json({
      success: true,
      data: updatedTransfer,
      message: "Stock transfer updated successfully",
    });
  } catch (error) {
    console.error("Error updating stock transfer:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message:
          "Validation error: " +
          Object.values(error.errors)
            .map((e) => e.message)
            .join(", "),
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while updating stock transfer",
      error: error.message,
    });
  }
});

// DELETE single stock transfer
router.delete("/stock-transfers/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid stock transfer ID",
      });
    }

    const transfer = await StockTransfer.findByIdAndDelete(id);

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: "Stock transfer not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Stock transfer deleted successfully",
      data: transfer,
    });
  } catch (error) {
    console.error("Error deleting stock transfer:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting stock transfer",
      error: error.message,
    });
  }
});

// DELETE multiple stock transfers (bulk delete)
router.delete("/stock-transfers/bulk/delete", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No stock transfer IDs provided",
      });
    }

    // Validate all IDs
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));

    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID(s) provided",
        invalidIds,
      });
    }

    const result = await StockTransfer.deleteMany({ _id: { $in: validIds } });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No stock transfers found to delete",
      });
    }

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} stock transfer(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error bulk deleting stock transfers:", error);
    res.status(500).json({
      success: false,
      message: "Server error during bulk delete",
      error: error.message,
    });
  }
});



export default router;
