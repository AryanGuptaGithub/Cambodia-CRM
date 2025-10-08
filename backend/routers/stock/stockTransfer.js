import express from "express";
import mongoose from "mongoose";
import StockTransfer from "../../models/stock/stockTransfer.js";
import Product from "../../models/projectManger/product.js";

const router = express.Router();

router.get("/stock-transfers/last-number", async (req, res) => {
  try {
    const lastTransfer = await StockTransfer.findOne()
      .sort({ invoiceNo: -1 })
      .select("invoiceNo");

    let lastNumber = 0;
    if (lastTransfer?.invoiceNo) {
      const match = lastTransfer.invoiceNo.match(/\d+/);
      lastNumber = match ? parseInt(match[0]) : 0;
    }

    res.json({ success: true, lastNumber });
  } catch (error) {
    console.error("Error fetching last stock transfer number:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching last stock transfer number",
    });
  }
});

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
        { warehouse: { $regex: search, $options: "i" } },
        { sourceWarehouse: { $regex: search, $options: "i" } },
        { destinationWarehouse: { $regex: search, $options: "i" } },
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

router.get("/stock-transfers/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid stock transfer ID",
    });
  }

  try {
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

router.post("/stock-transfers", async (req, res) => {
  try {
    const {
      invoiceNo,
      date,
      items,
      remarks,
      notes,
      status,
      transferType,
      shipping,
      totalExpenses,
      grandTotal,
    } = req.body;

    if (!invoiceNo || !date || !items || !status || !transferType) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: invoiceNo, date, items, status, transferType",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one item is required",
      });
    }

    const validTransferTypes = ["send", "receive"];
    if (!validTransferTypes.includes(transferType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid transfer type. Must be 'send' or 'receive'",
      });
    }

    for (const item of items) {
      if (!item.productId || !item.productName) {
        return res.status(400).json({
          success: false,
          message: "Each item must have productId and productName",
        });
      }

      const numericFields = [
        item.boxQuantity,
        item.openPieces,
        item.qtyPerCarton,
        item.totalPieces,
        item.expenses,
      ];

      if (numericFields.some((val) => isNaN(val))) {
        return res.status(400).json({
          success: false,
          message: "All numeric fields must be valid numbers",
        });
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productName}`,
        });
      }

      if (transferType === "send") {
        if (product.stockQuantity < item.totalPieces) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${item.productName}. Available: ${product.stockQuantity}, Required: ${item.totalPieces}`,
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
        openPieces: parseFloat(item.openPieces),
        qtyPerCarton: parseFloat(item.qtyPerCarton),
        totalPieces: parseFloat(item.totalPieces),
        expenses: parseFloat(item.expenses),
      })),
      remarks: remarks || "",
      notes: notes || "",
      status,
      transferType,
      shipping: parseFloat(shipping || 0),
      totalExpenses: parseFloat(totalExpenses || 0),
      grandTotal: parseFloat(grandTotal || 0),
    });

    const savedTransfer = await stockTransfer.save();

    for (const item of items) {
      const quantityChange =
        transferType === "send" ? -item.totalPieces : item.totalPieces;
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stockQuantity: quantityChange },
      });
    }

    res.status(201).json({
      success: true,
      message: `Stock transfer ${
        transferType === "send" ? "sent" : "received"
      } successfully`,
      data: savedTransfer,
    });
  } catch (error) {
    console.error("Error creating stock transfer:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Invoice number already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

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

    const updateData = { ...req.body };

    // Handle items update with proper field mapping and validation
    if (req.body.items) {
      updateData.items = req.body.items.map((item, index) => {
        let productId, productName;

        // Handle different data formats from frontend
        if (item.product && typeof item.product === "object") {
          // New format with product object
          productId = item.product.value || item.productId;
          productName = item.product.label || item.productName;
        } else if (item.productId) {
          // Existing format
          productId = item.productId;
          productName = item.productName;
        } else {
          // Fallback - this should not happen with proper frontend validation
          throw new Error(`Item ${index} is missing productId`);
        }

        // Validate required fields
        if (!productId) {
          throw new Error(`Item ${index} has invalid productId`);
        }

        if (!productName) {
          throw new Error(`Item ${index} has invalid productName`);
        }

        return {
          productId: productId,
          productName: productName,
          boxQuantity: parseInt(item.boxQuantity) || 0,
          openPieces: parseInt(item.openPieces) || 0,
          qtyPerCarton: parseInt(item.qtyPerCarton) || 0,
          totalPieces: parseInt(item.totalPieces) || 0,
          expenses: parseFloat(item.expenses) || 0,
        };
      });

      // Calculate total expenses from items
      const totalItemsExpenses = updateData.items.reduce(
        (sum, item) => sum + (parseFloat(item.expenses) || 0),
        0
      );
      updateData.totalExpenses = totalItemsExpenses;
    }

    // Calculate grand total (total expenses + shipping)
    if (
      req.body.shipping !== undefined ||
      req.body.totalExpenses !== undefined
    ) {
      const shipping = parseFloat(req.body.shipping) || transfer.shipping;
      const totalExpenses =
        parseFloat(updateData.totalExpenses) || transfer.totalExpenses;
      updateData.grandTotal = shipping + totalExpenses;
    }

    const updatedTransfer = await StockTransfer.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({
      success: true,
      message: "Stock transfer updated successfully",
      data: updatedTransfer,
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

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Invoice number already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while updating stock transfer",
      error: error.message,
    });
  }
});

router.delete("/stock-transfers/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid stock transfer ID",
    });
  }

  try {
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

router.delete("/stock-transfers/bulk/delete", async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No stock transfer IDs provided",
    });
  }

  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));

  if (invalidIds.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid ID(s) provided",
      invalidIds,
    });
  }

  try {
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
