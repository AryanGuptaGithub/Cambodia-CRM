import express from "express";
import PurchaseReturn from "../../models/purcharsing/purchaseReturns.js";
import mongoose from "mongoose";
const router = express.Router();

// GET all purchase returns
router.get("/purchase-return", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search = "",
      status = "",
      startDate = "",
      endDate = "",
    } = req.query;

    // Build filter object
    const filter = {};

    // Search filter
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { productName: { $regex: search, $options: "i" } },
        { lcNumber: { $regex: search, $options: "i" } },
        { returnReason: { $regex: search, $options: "i" } },
      ];
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Date range filter
    if (startDate || endDate) {
      filter.recordingDate = {};
      if (startDate) filter.recordingDate.$gte = new Date(startDate);
      if (endDate) filter.recordingDate.$lte = new Date(endDate);
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const total = await PurchaseReturn.countDocuments(filter);

    // Get purchase returns with pagination and sorting
    const purchaseReturns = await PurchaseReturn.find(filter)
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      success: true,
      data: purchaseReturns,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    });
  } catch (error) {
    console.error("Error fetching purchase returns:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET purchase return by ID
router.get("/purchase-return/:id", async (req, res) => {
  try {
    const purchaseReturn = await PurchaseReturn.findById(req.params.id);

    if (!purchaseReturn) {
      return res.status(404).json({
        success: false,
        message: "Purchase return not found",
      });
    }

    res.json({
      success: true,
      data: purchaseReturn,
    });
  } catch (error) {
    console.error("Error fetching purchase return:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// POST create new purchase return
router.post("/purchase-return", async (req, res) => {
  try {
    const {
      recordingDate,
      invoiceNumber,
      invoiceDate,
      deliveryNumber,
      receivedDate,
      productName,
      purchaseQty,
      returnQuantity,
      usedQty,
      fob,
      cif,
      lcNumber,
      amount,
      returnAmount,
      remarks,
      returnReason,
      supplierName,
    } = req.body;

    // Check if purchase return with same invoice number and product already exists
    const existingReturn = await PurchaseReturn.findOne({
      invoiceNumber,
      productName,
    });

    if (existingReturn) {
      return res.status(400).json({
        success: false,
        message: "Purchase return for this invoice and product already exists",
      });
    }

    // Validate return quantity doesn't exceed purchase quantity
    if (returnQuantity > purchaseQty) {
      return res.status(400).json({
        success: false,
        message: "Return quantity cannot exceed purchase quantity",
      });
    }

    // Validate used quantity doesn't exceed purchase quantity
    if (usedQty > purchaseQty) {
      return res.status(400).json({
        success: false,
        message: "Used quantity cannot exceed purchase quantity",
      });
    }

    const newPurchaseReturn = new PurchaseReturn({
      recordingDate,
      invoiceNumber,
      invoiceDate,
      deliveryNumber,
      receivedDate,
      productName,
      purchaseQty: parseFloat(purchaseQty),
      returnQuantity: parseFloat(returnQuantity),
      usedQty: parseFloat(usedQty) || 0,
      fob: parseFloat(fob) || 0,
      cif: parseFloat(cif) || 0,
      lcNumber,
      amount: parseFloat(amount),
      returnAmount: parseFloat(returnAmount),
      remarks,
      returnReason,
      supplierName: supplierName || "",
    });

    const savedPurchaseReturn = await newPurchaseReturn.save();

    res.status(201).json({
      success: true,
      message: "Purchase return created successfully",
      data: savedPurchaseReturn,
    });
  } catch (error) {
    console.error("Error creating purchase return:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// PUT update purchase return
router.put("/purchase-return/:id", async (req, res) => {
  try {
    const {
      recordingDate,
      invoiceNumber,
      invoiceDate,
      deliveryNumber,
      receivedDate,
      productName,
      purchaseQty,
      returnQuantity,
      usedQty,
      fob,
      cif,
      lcNumber,
      amount,
      returnAmount,
      remarks,
      returnReason,
      supplierName,
      status,
    } = req.body;

    // Check if another purchase return with same invoice number and product exists
    const existingReturn = await PurchaseReturn.findOne({
      invoiceNumber,
      productName,
      _id: { $ne: req.params.id },
    });

    if (existingReturn) {
      return res.status(400).json({
        success: false,
        message:
          "Another purchase return for this invoice and product already exists",
      });
    }

    const updatedPurchaseReturn = await PurchaseReturn.findByIdAndUpdate(
      req.params.id,
      {
        recordingDate,
        invoiceNumber,
        invoiceDate,
        deliveryNumber,
        receivedDate,
        productName,
        purchaseQty: parseFloat(purchaseQty),
        returnQuantity: parseFloat(returnQuantity),
        usedQty: parseFloat(usedQty) || 0,
        fob: parseFloat(fob) || 0,
        cif: parseFloat(cif) || 0,
        lcNumber,
        amount: parseFloat(amount),
        returnAmount: parseFloat(returnAmount),
        remarks,
        returnReason,
        supplierName: supplierName || "",
        status: status || "pending",
        updatedAt: Date.now(),
      },
      { new: true, runValidators: true }
    );

    if (!updatedPurchaseReturn) {
      return res.status(404).json({
        success: false,
        message: "Purchase return not found",
      });
    }

    res.json({
      success: true,
      message: "Purchase return updated successfully",
      data: updatedPurchaseReturn,
    });
  } catch (error) {
    console.error("Error updating purchase return:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// DELETE purchase return
router.delete("/purchase-return/:id", async (req, res) => {
  try {
    const deletedPurchaseReturn = await PurchaseReturn.findByIdAndDelete(
      req.params.id
    );

    if (!deletedPurchaseReturn) {
      return res.status(404).json({
        success: false,
        message: "Purchase return not found",
      });
    }

    res.json({
      success: true,
      message: "Purchase return deleted successfully",
      data: deletedPurchaseReturn,
    });
  } catch (error) {
    console.error("Error deleting purchase return:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});
router.delete("/purchase-return", async (req, res) => {
  try {
    const { ids } = req.body;

    // Validate that ids array is provided and not empty
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No purchase return IDs provided for deletion",
      });
    }

    // Validate that all IDs are valid MongoDB ObjectIds
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid purchase return IDs provided",
        invalidIds: invalidIds,
      });
    }

    // Delete multiple purchase returns
    const deleteResult = await PurchaseReturn.deleteMany({
      _id: { $in: ids },
    });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No purchase returns found to delete",
      });
    }

    res.json({
      success: true,
      message: `${deleteResult.deletedCount} purchase return(s) deleted successfully`,
      data: {
        deletedCount: deleteResult.deletedCount,
      },
    });
  } catch (error) {
    console.error("Error deleting purchase returns:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting purchase returns",
      error: error.message,
    });
  }
});

// GET purchase returns by invoice number
router.get("/purchase-return/invoice/:invoiceNumber", async (req, res) => {
  try {
    const purchaseReturns = await PurchaseReturn.find({
      invoiceNumber: new RegExp(req.params.invoiceNumber, "i"),
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: purchaseReturns,
    });
  } catch (error) {
    console.error("Error fetching purchase returns by invoice:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET purchase returns statistics
router.get("/purchase-return/stats/summary", async (req, res) => {
  try {
    const totalReturns = await PurchaseReturn.countDocuments();
    const pendingReturns = await PurchaseReturn.countDocuments({
      status: "pending",
    });
    const approvedReturns = await PurchaseReturn.countDocuments({
      status: "approved",
    });
    const completedReturns = await PurchaseReturn.countDocuments({
      status: "completed",
    });

    const totalAmount = await PurchaseReturn.aggregate([
      { $group: { _id: null, total: { $sum: "$returnAmount" } } },
    ]);

    const totalQuantity = await PurchaseReturn.aggregate([
      { $group: { _id: null, total: { $sum: "$returnQuantity" } } },
    ]);

    res.json({
      success: true,
      data: {
        totalReturns,
        pendingReturns,
        approvedReturns,
        completedReturns,
        totalReturnAmount: totalAmount[0]?.total || 0,
        totalReturnQuantity: totalQuantity[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching purchase return statistics:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// PATCH update purchase return status
router.patch("/purchase-return/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    if (!["pending", "approved", "rejected", "completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const updatedPurchaseReturn = await PurchaseReturn.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updatedPurchaseReturn) {
      return res.status(404).json({
        success: false,
        message: "Purchase return not found",
      });
    }

    res.json({
      success: true,
      message: `Purchase return ${status} successfully`,
      data: updatedPurchaseReturn,
    });
  } catch (error) {
    console.error("Error updating purchase return status:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

export default router;
