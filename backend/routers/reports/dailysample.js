import express from "express";
import mongoose from "mongoose";
import DailySampleReport from "../../models/reports/dailysample.js";

const router = express.Router();

/**
 * POST /import
 * Import bulk daily sample reports
 * Accessible at: /api/reports/daily-sample/import
 */
router.post("/import", async (req, res) => {
  try {
    const data = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No data provided for import",
      });
    }

    // Filter and map entries to match schema and do basic validation
    const validEntries = [];
    const invalidEntries = [];

    data.forEach((entry, index) => {
      // Basic required fields check
      if (
        !entry.requestNumber ||
        !entry.date ||
        !entry.mrName ||
        !entry.productName
      ) {
        invalidEntries.push({
          index: index + 1,
          reason: "Missing required fields",
          entry,
        });
        return;
      }

      // Convert date string/number to Date object
      const parsedDate = new Date(entry.date);
      if (isNaN(parsedDate)) {
        invalidEntries.push({
          index: index + 1,
          reason: "Invalid date format",
          entry,
        });
        return;
      }

      validEntries.push({
        requestNumber: entry.requestNumber,
        date: parsedDate,
        mrName: entry.mrName,
        description: entry.description || "",
        productName: entry.productName,
        qtyBigBox: Number(entry.qtyBigBox) || 0,
        qtySmallBox: Number(entry.qtySmallBox) || 0,
        totalQty: Number(entry.totalQty) || 0,
        qtyPerBox: Number(entry.qtyPerBox) || 0,
        remark: entry.remark || "",
      });
    });

    if (validEntries.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid daily sample records found in the uploaded file",
        invalidEntries,
      });
    }

    const result = await DailySampleReport.insertMany(validEntries, {
      ordered: false, // Continue inserting even if some fail
    });

    res.status(200).json({
      success: true,
      message: "Daily sample reports imported successfully",
      data: {
        imported: result.length,
        failed: invalidEntries.length,
        invalidEntries: invalidEntries.length > 0 ? invalidEntries : undefined,
      },
    });
  } catch (err) {
    console.error("Import Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while importing data",
      error: err.message,
    });
  }
});

/**
 * GET /
 * Get all daily sample reports with pagination and filtering
 * Accessible at: /api/reports/daily-sample
 */
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      mrName,
      productName,
      requestNumber,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build query
    const query = {};

    if (mrName) {
      query.mrName = { $regex: mrName, $options: "i" };
    }

    if (productName) {
      query.productName = { $regex: productName, $options: "i" };
    }

    if (requestNumber) {
      query.requestNumber = { $regex: requestNumber, $options: "i" };
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reports = await DailySampleReport.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await DailySampleReport.countDocuments(query);

    res.status(200).json({
      success: true,
      data: reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch daily sample reports",
      error: err.message,
    });
  }
});

/**
 * GET /statistics
 * Get daily sample statistics
 * Accessible at: /api/reports/daily-sample/statistics
 */
router.get("/statistics", async (req, res) => {
  try {
    const { startDate, endDate, mrName } = req.query;

    const matchStage = {};

    // Date range filter
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    // MR filter
    if (mrName) {
      matchStage.mrName = { $regex: mrName, $options: "i" };
    }

    // Overall statistics
    const overallStats = await DailySampleReport.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalReports: { $sum: 1 },
          totalBigBoxes: { $sum: "$qtyBigBox" },
          totalSmallBoxes: { $sum: "$qtySmallBox" },
          totalQty: { $sum: "$totalQty" },
        },
      },
    ]);

    // Statistics by MR
    const statsByMR = await DailySampleReport.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$mrName",
          reportCount: { $sum: 1 },
          totalBigBoxes: { $sum: "$qtyBigBox" },
          totalSmallBoxes: { $sum: "$qtySmallBox" },
          totalQty: { $sum: "$totalQty" },
        },
      },
      { $sort: { reportCount: -1 } },
      { $limit: 10 },
    ]);

    // Statistics by Product
    const statsByProduct = await DailySampleReport.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$productName",
          reportCount: { $sum: 1 },
          totalBigBoxes: { $sum: "$qtyBigBox" },
          totalSmallBoxes: { $sum: "$qtySmallBox" },
          totalQty: { $sum: "$totalQty" },
        },
      },
      { $sort: { totalQty: -1 } },
      { $limit: 10 },
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: overallStats[0] || {
          totalReports: 0,
          totalBigBoxes: 0,
          totalSmallBoxes: 0,
          totalQty: 0,
        },
        byMR: statsByMR,
        byProduct: statsByProduct,
      },
    });
  } catch (err) {
    console.error("Statistics Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: err.message,
    });
  }
});

/**
 * GET /:id
 * Get single daily sample report by ID
 * Accessible at: /api/reports/daily-sample/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report ID format",
      });
    }

    const report = await DailySampleReport.findById(id).lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Daily sample report not found",
      });
    }

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report",
      error: err.message,
    });
  }
});

/**
 * POST /
 * Create new daily sample report
 * Accessible at: /api/reports/daily-sample
 */
router.post("/", async (req, res) => {
  try {
    const {
      requestNumber,
      date,
      mrName,
      description,
      productName,
      qtyBigBox = 0,
      qtySmallBox = 0,
      totalQty = 0,
      qtyPerBox = 0,
      remark,
    } = req.body;

    // Validation
    if (!requestNumber || !date || !mrName || !productName) {
      return res.status(400).json({
        success: false,
        message:
          "Request number, date, MR name, and product name are required",
      });
    }

    // Validate quantities
    if (qtyBigBox < 0 || qtySmallBox < 0 || totalQty < 0 || qtyPerBox < 0) {
      return res.status(400).json({
        success: false,
        message: "Quantities must be 0 or greater",
      });
    }

    // Validate date
    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    // Create and save the report
    const report = new DailySampleReport({
      requestNumber,
      date: parsedDate,
      mrName,
      description: description || "",
      productName,
      qtyBigBox,
      qtySmallBox,
      totalQty,
      qtyPerBox,
      remark: remark || "",
    });

    await report.save();

    res.status(201).json({
      success: true,
      message: `Daily sample report for ${report.productName} - ${report.mrName} added successfully`,
      data: report,
    });
  } catch (error) {
    console.error("Error saving daily sample report:", error);

    if (error.name === "ValidationError") {
      const validationErrors = {};
      for (const field in error.errors) {
        validationErrors[field] = error.errors[field].message;
      }

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while creating report",
      error: error.message,
    });
  }
});

/**
 * PUT /:id
 * Update daily sample report
 * Accessible at: /api/reports/daily-sample/:id
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report ID format",
      });
    }

    // Validate quantities if provided
    if (
      (updateData.qtyBigBox !== undefined && updateData.qtyBigBox < 0) ||
      (updateData.qtySmallBox !== undefined && updateData.qtySmallBox < 0) ||
      (updateData.totalQty !== undefined && updateData.totalQty < 0) ||
      (updateData.qtyPerBox !== undefined && updateData.qtyPerBox < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Quantities must be 0 or greater",
      });
    }

    // Validate date if provided
    if (updateData.date) {
      const parsedDate = new Date(updateData.date);
      if (isNaN(parsedDate)) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format",
        });
      }
      updateData.date = parsedDate;
    }

    const updated = await DailySampleReport.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Daily sample report not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Daily sample report updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("Update error:", err);

    if (err.name === "ValidationError") {
      const validationErrors = {};
      for (const field in err.errors) {
        validationErrors[field] = err.errors[field].message;
      }

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while updating report",
      error: err.message,
    });
  }
});

/**
 * DELETE /:id
 * Delete single daily sample report
 * Accessible at: /api/reports/daily-sample/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report ID format",
      });
    }

    const deleted = await DailySampleReport.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Daily sample report not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Daily sample report deleted successfully",
      data: deleted,
    });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while deleting record",
      error: err.message,
    });
  }
});

/**
 * DELETE /bulk
 * Bulk delete daily sample reports
 * Accessible at: /api/reports/daily-sample/bulk
 */
router.delete("/bulk", async (req, res) => {
  try {
    let { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No IDs provided for deletion",
      });
    }

    // Normalize IDs (handle both string and object formats)
    ids = ids.map((item) => (typeof item === "string" ? item : item.id));

    // Validate all IDs
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
        message: "Invalid ID(s) provided",
        invalidIds,
      });
    }

    const result = await DailySampleReport.deleteMany({
      _id: { $in: validIds },
    });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} record(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting records",
      error: error.message,
    });
  }
});

export default router;
