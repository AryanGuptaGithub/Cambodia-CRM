import express from "express";
import mongoose from "mongoose";
import SalesReturn from "../../models/sale/saleReturn.js";

const router = express.Router();

// POST - Create Sales Return Records
router.post("/salesreturn", async (req, res) => {
  try {
    const data = req.body;
    console.log("Received sales return data:", data);

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        message: "Expected a non-empty array of sales return records",
      });
    }

    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerCode",
      "customerName",
      "productName",
      "salesQty",
      "returnQuantity",
      "usedQty",
      "sellingPrice",
      "amount",
      "discount",
      "netSellingAmount",
      "usedPrice",
      "paidAmount",
      "dueAmount",
      "usedAmount",
      "paymentStatus",
    ];

    const processedData = data.map((record, index) => {
      for (const field of requiredFields) {
        if (record[field] === undefined || record[field] === null) {
          throw new Error(
            `Missing required field "${field}" in record ${index + 1}`
          );
        }
      }

      return {
        ...record,
        salesQty: Number(record.salesQty),
        returnQuantity: Number(record.returnQuantity),
        usedQty: Number(record.usedQty),
        sellingPrice: Number(record.sellingPrice),
        amount: Number(record.amount),
        discount: Number(record.discount),
        netSellingAmount: Number(record.netSellingAmount),
        usedPrice: Number(record.usedPrice),
        paidAmount: Number(record.paidAmount),
        dueAmount: Number(record.dueAmount),
        usedAmount: Number(record.usedAmount),
        remark: record.remark || "",
      };
    });

    const savedReturns = await SalesReturn.insertMany(processedData);

    return res.status(201).json({
      message: `${savedReturns.length} sales return records saved successfully.`,
      data: savedReturns,
    });
  } catch (error) {
    console.error("Error saving sales returns:", error);

    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

// GET - Fetch Sales Return Records
router.get("/salesreturn", async (req, res) => {
  try {
    const filters = {};
    if (req.query.invoiceNumber) {
      filters.invoiceNumber = req.query.invoiceNumber;
    }
    if (req.query.customerCode) {
      filters.customerCode = req.query.customerCode;
    }

    const returns = await SalesReturn.find(filters).sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Sales return records fetched successfully.",
      data: returns,
    });
  } catch (error) {
    console.error("Error fetching sales return records:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

// DELETE - Delete Sales Return Records by IDs
router.delete("/salesreturn", async (req, res) => {
  try {
    const { ids } = req.body;
    console.log("values of ids", ids);

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No sale return IDs provided for deletion",
      });
    }

    // Validate MongoDB ObjectIds
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
      return res.status(400).json({
        success: false,
        message: `Invalid MongoDB ObjectId(s): ${invalidIds.join(", ")}`,
        invalidIds,
      });
    }

    // Delete the sales returns
    const result = await SalesReturn.deleteMany({
      _id: { $in: validIds },
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No sale returns found with the provided IDs",
      });
    }

    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} sale return(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting sales return:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting sale returns",
      error: error.message,
    });
  }
});

// PUT - Update a single sales return by ID
router.put("/salesreturn/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    // Validate the ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sales return ID",
      });
    }

    // Optional: Validate required fields
    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerCode",
      "customerName",
      "productName",
      "salesQty",
      "returnQuantity",
      "usedQty",
      "sellingPrice",
      "amount",
      "discount",
      "netSellingAmount",
      "usedPrice",
      "paidAmount",
      "dueAmount",
      "usedAmount",
      "paymentStatus",
    ];

    for (const field of requiredFields) {
      if (updatedData[field] === undefined || updatedData[field] === null) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
        });
      }
    }

    // Convert numeric fields
    const numericFields = [
      "salesQty",
      "returnQuantity",
      "usedQty",
      "sellingPrice",
      "amount",
      "discount",
      "netSellingAmount",
      "usedPrice",
      "paidAmount",
      "dueAmount",
      "usedAmount",
    ];

    numericFields.forEach((field) => {
      updatedData[field] = Number(updatedData[field]);
    });

    // Perform the update
    const updatedReturn = await SalesReturn.findByIdAndUpdate(
      id,
      updatedData,
      { new: true } // Return the updated document
    );

    if (!updatedReturn) {
      return res.status(404).json({
        success: false,
        message: "Sales return record not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Sales return updated successfully",
      data: updatedReturn,
    });
  } catch (error) {
    console.error("Error updating sales return:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// DELETE single sales return by ID
router.delete("/salesreturn/:id", async (req, res) => {
  const { id } = req.params;

  // Validate MongoDB ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid sales return ID",
    });
  }

  try {
    const deleted = await SalesReturn.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Sales return not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Sales return deleted successfully",
      data: deleted,
    });
  } catch (error) {
    console.error("Error deleting sales return:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting sales return",
      error: error.message,
    });
  }
});

export default router;
