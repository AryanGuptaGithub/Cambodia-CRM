import express from "express";
import mongoose from "mongoose";
import DailySampleReport from "../../models/reports/dailysample.js";
import MRStockInHand from "../../models/sale/mrStockHand.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Staff from "../../models/staffMember/staff.js";

const router = express.Router();

// ================== UTILITY FUNCTIONS ==================
function escapeRegex(str) {
  if (!str) return "";
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name.toLowerCase().trim().replace(/\s+/g, " ");
};

// Flexible search in ReportInHand (warehouse stock)
const findReportInHandFlexible = async (productName, session = null) => {
  try {
    const normalized = normalizeProductName(productName);
    // Exact match first
    let query = ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") }
    });
    if (session) query = query.session(session);
    let stock = await query;

    if (!stock) {
      // Allow any characters between words
      const parts = normalized.split(/\s+/);
      const flexiblePattern = parts.map(p => escapeRegex(p)).join("\\s*.*?\\s*");
      query = ReportInHand.findOne({
        productName: { $regex: new RegExp(flexiblePattern, "i") }
      });
      if (session) query = query.session(session);
      stock = await query;
    }

    // Last resort: simple substring
    if (!stock) {
      query = ReportInHand.findOne({
        productName: { $regex: new RegExp(escapeRegex(normalized), "i") }
      });
      if (session) query = query.session(session);
      stock = await query;
    }

    return stock;
  } catch (error) {
    console.error(`❌ Error finding ReportInHand for ${productName}:`, error);
    return null;
  }
};

// Update MR's stock (add or increment)
const updateMRStock = async (mrName, productName, quantity, lc, session) => {
  try {
    const mr = await Staff.findOne({
      medicalRepName: { $regex: new RegExp(`^${escapeRegex(mrName)}$`, "i") }
    }).session(session);

    if (!mr) {
      throw new Error(`MR "${mrName}" not found in Staff`);
    }

    let mrStock = await MRStockInHand.findOne({ mrId: mr._id }).session(session);

    if (!mrStock) {
      mrStock = new MRStockInHand({
        mrId: mr._id,
        mrName: mr.medicalRepName,
        productsInHand: []
      });
    }

    const productIndex = mrStock.productsInHand.findIndex(
      p => p.productName.toLowerCase().trim() === productName.toLowerCase().trim()
    );

    if (productIndex === -1) {
      mrStock.productsInHand.push({
        productName: productName,
        quantity: quantity,
        lc: lc || 0,
        lastUpdated: new Date()
      });
    } else {
      mrStock.productsInHand[productIndex].quantity += quantity;
      mrStock.productsInHand[productIndex].lastUpdated = new Date();
    }

    mrStock.updatedAt = new Date();
    await mrStock.save({ session });

    return mrStock;
  } catch (error) {
    console.error("❌ Error updating MR stock:", error);
    throw error;
  }
};

// ================== STOCK UPDATE HELPERS (USING BATCHES ARRAY) ==================

/**
 * Called when a daily sample is ADDED.
 * Deducts from warehouse by pushing a "remove" batch entry linked to the daily sample.
 */
const updateStockOnAdd = async (dailySample, session = null) => {
  try {
    const { productName, totalQty, mrName, _id } = dailySample;
    const qty = Number(totalQty);
    if (isNaN(qty) || qty <= 0) return;

    const reportInHand = await findReportInHandFlexible(productName, session);
    if (!reportInHand) {
      throw new Error(`Product "${productName}" not found in warehouse (ReportInHand)`);
    }

    // Check sufficient stock (current totalBoxes already reflects all previous adjustments)
    if (reportInHand.totalBoxes < qty) {
      throw new Error(`Insufficient stock. Available: ${reportInHand.totalBoxes}, Required: ${qty}`);
    }

    // Add a removal entry linked to this daily sample
    reportInHand.batches.push({
      boxes: qty,
      adjustmentType: "remove",
      date: new Date(),
      adjustmentId: _id   // store the daily sample's _id for later lookup
    });

    await reportInHand.save({ session });

    // Update MR stock
    const lc = 0; // you may fetch actual LC from product catalog if needed
    await updateMRStock(mrName, productName, qty, lc, session);
  } catch (error) {
    console.error("❌ Error in updateStockOnAdd:", error);
    throw error;
  }
};

/**
 * Called when a daily sample is DELETED.
 * Restores stock by removing the linked "remove" batch entry.
 */
const updateStockOnDelete = async (dailySample, session = null) => {
  try {
    const { productName, totalQty, mrName, _id } = dailySample;
    const qty = Number(totalQty);
    if (isNaN(qty) || qty <= 0) return;

    const reportInHand = await findReportInHandFlexible(productName, session);
    if (!reportInHand) {
      throw new Error(`Product "${productName}" not found in warehouse (ReportInHand)`);
    }

    // Find the removal entry that matches this daily sample's _id
    const removalIndex = reportInHand.batches.findIndex(
      b => b.adjustmentType === "remove" && b.adjustmentId && b.adjustmentId.toString() === _id.toString()
    );

    if (removalIndex === -1) {
      console.warn(`No removal entry found for daily sample ${_id} – cannot reverse stock.`);
      return;
    }

    // Remove that entry
    reportInHand.batches.splice(removalIndex, 1);
    await reportInHand.save({ session });

    // Remove from MR's stock
    const mr = await Staff.findOne({
      medicalRepName: { $regex: new RegExp(`^${escapeRegex(mrName)}$`, "i") }
    }).session(session);

    if (mr) {
      const mrStock = await MRStockInHand.findOne({ mrId: mr._id }).session(session);
      if (mrStock) {
        const productIndex = mrStock.productsInHand.findIndex(
          p => p.productName.toLowerCase().trim() === productName.toLowerCase().trim()
        );
        if (productIndex !== -1) {
          mrStock.productsInHand[productIndex].quantity -= qty;
          if (mrStock.productsInHand[productIndex].quantity <= 0) {
            mrStock.productsInHand.splice(productIndex, 1);
          }
          mrStock.updatedAt = new Date();
          await mrStock.save({ session });
        }
      }
    }

    console.log(`✅ Reversed: ${qty} of ${productName} returned to warehouse from MR ${mrName}`);
  } catch (error) {
    console.error("❌ Error in updateStockOnDelete:", error);
    throw error;
  }
};

/**
 * Called when a daily sample is UPDATED.
 * Handles quantity changes (adjusts the linked batch entry) and MR changes (transfers MR stock).
 */
const updateStockOnUpdate = async (oldData, newData, session = null) => {
  try {
    const { productName, totalQty: oldQty, mrName: oldMrName, _id } = oldData;
    const { totalQty: newQty, mrName: newMrName } = newData;

    const oldQ = Number(oldQty);
    const newQ = Number(newQty);
    const qtyDifference = newQ - oldQ;

    // ----- 1. Handle quantity change (warehouse stock) -----
    if (qtyDifference !== 0) {
      const reportInHand = await findReportInHandFlexible(productName, session);
      if (!reportInHand) {
        throw new Error(`Product "${productName}" not found in warehouse`);
      }

      // Find the removal entry for this daily sample
      const removalEntry = reportInHand.batches.find(
        b => b.adjustmentType === "remove" && b.adjustmentId && b.adjustmentId.toString() === _id.toString()
      );
      if (!removalEntry) {
        throw new Error(`No removal entry found for daily sample ${_id}`);
      }

      if (qtyDifference > 0) {
        // Need to take extra stock – check availability
        // Current totalBoxes already reflects the old removal.
        // Stock before this removal = totalBoxes + oldQ.
        const availableBeforeRemoval = reportInHand.totalBoxes + oldQ;
        if (availableBeforeRemoval < newQ) {
          throw new Error(`Insufficient stock. Available before removal: ${availableBeforeRemoval}, Required: ${newQ}`);
        }
        removalEntry.boxes = newQ;  // increase the removal
      } else {
        // Returning stock – no availability check needed
        removalEntry.boxes = newQ;  // decrease the removal
      }

      await reportInHand.save({ session });
    }

    // ----- 2. Handle MR change (if MR name changed) -----
    if (oldMrName !== newMrName) {
      const transferQty = newQ; // use the (possibly updated) quantity

      // Remove from old MR
      const oldMr = await Staff.findOne({
        medicalRepName: { $regex: new RegExp(`^${escapeRegex(oldMrName)}$`, "i") }
      }).session(session);
      if (oldMr) {
        const oldMrStock = await MRStockInHand.findOne({ mrId: oldMr._id }).session(session);
        if (oldMrStock) {
          const productIndex = oldMrStock.productsInHand.findIndex(
            p => p.productName.toLowerCase().trim() === productName.toLowerCase().trim()
          );
          if (productIndex !== -1) {
            oldMrStock.productsInHand[productIndex].quantity -= transferQty;
            if (oldMrStock.productsInHand[productIndex].quantity <= 0) {
              oldMrStock.productsInHand.splice(productIndex, 1);
            }
            oldMrStock.updatedAt = new Date();
            await oldMrStock.save({ session });
          }
        }
      }

      // Add to new MR
      const newMr = await Staff.findOne({
        medicalRepName: { $regex: new RegExp(`^${escapeRegex(newMrName)}$`, "i") }
      }).session(session);
      if (newMr) {
        let newMrStock = await MRStockInHand.findOne({ mrId: newMr._id }).session(session);
        if (!newMrStock) {
          newMrStock = new MRStockInHand({
            mrId: newMr._id,
            mrName: newMr.medicalRepName,
            productsInHand: []
          });
        }
        const productIndex = newMrStock.productsInHand.findIndex(
          p => p.productName.toLowerCase().trim() === productName.toLowerCase().trim()
        );
        if (productIndex === -1) {
          newMrStock.productsInHand.push({
            productName: productName,
            quantity: transferQty,
            lc: 0,
            lastUpdated: new Date()
          });
        } else {
          newMrStock.productsInHand[productIndex].quantity += transferQty;
          newMrStock.productsInHand[productIndex].lastUpdated = new Date();
        }
        newMrStock.updatedAt = new Date();
        await newMrStock.save({ session });
      }
    }

    console.log(`✅ Stock updated for daily sample ${_id}`);
  } catch (error) {
    console.error("❌ Error in updateStockOnUpdate:", error);
    throw error;
  }
};

// ================== ROUTES ==================

router.post("/import", async (req, res) => {
  try {
    const data = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No data provided for import",
      });
    }

    const validEntries = [];
    const invalidEntries = [];

    data.forEach((entry, index) => {
      if (!entry.requestNumber || !entry.date || !entry.mrName || !entry.productName) {
        invalidEntries.push({ index: index + 1, reason: "Missing required fields", entry });
        return;
      }

      const parsedDate = new Date(entry.date);
      if (isNaN(parsedDate)) {
        invalidEntries.push({ index: index + 1, reason: "Invalid date format", entry });
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

    const result = await DailySampleReport.insertMany(validEntries, { ordered: false });

    for (const entry of result) {
      try {
        await updateStockOnAdd(entry);  // no session in import (can be added if needed)
      } catch (stockError) {
        console.error(`Failed to update stock for entry ${entry.requestNumber}:`, stockError);
      }
    }

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

    const query = {};

    if (mrName) query.mrName = { $regex: mrName, $options: "i" };
    if (productName) query.productName = { $regex: productName, $options: "i" };
    if (requestNumber) query.requestNumber = { $regex: requestNumber, $options: "i" };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reports = await DailySampleReport.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await DailySampleReport.countDocuments(query);

    res.status(200).json({
      success: true,
      reports: reports,
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

router.get("/statistics", async (req, res) => {
  try {
    const { startDate, endDate, mrName } = req.query;

    const matchStage = {};
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }
    if (mrName) matchStage.mrName = { $regex: mrName, $options: "i" };

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

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid report ID format" });
    }

    const report = await DailySampleReport.findById(id).lean();

    if (!report) {
      return res.status(404).json({ success: false, message: "Daily sample report not found" });
    }

    res.status(200).json({ success: true, data: report });
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report",
      error: err.message,
    });
  }
});

router.post("/", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      mrId,
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

    if (!date || !mrName || !productName) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Date, MR name, and product name are required" });
    }

    if (qtyBigBox < 0 || qtySmallBox < 0 || totalQty < 0 || qtyPerBox < 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Quantities must be 0 or greater" });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Invalid date format" });
    }

    if (mrId && !mongoose.Types.ObjectId.isValid(mrId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Invalid MR ID format" });
    }
    if (mrId) {
      const mrExists = await Staff.exists({ _id: mrId }).session(session);
      if (!mrExists) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "MR not found with the provided ID" });
      }
    }

    const report = new DailySampleReport({
      date: parsedDate,
      mrId: mrId || null,
      mrName,
      description: description || "",
      productName,
      qtyBigBox,
      qtySmallBox,
      totalQty,
      qtyPerBox,
      remark: remark || "",
    });

    await report.save({ session });

    await updateStockOnAdd(report, session);

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: `Daily sample report for ${report.productName} - ${report.mrName} added successfully`,
      data: report,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error saving daily sample report:", error);

    // 👇 NEW: Return insufficient stock error as a 400 with clear message
    if (error.message && error.message.startsWith('Insufficient stock')) {
      return res.status(400).json({ 
        success: false, 
        message: error.message 
      });
    }

    if (error.name === "ValidationError") {
      const validationErrors = {};
      for (const field in error.errors) {
        validationErrors[field] = error.errors[field].message;
      }
      return res.status(400).json({ 
        success: false, 
        message: "Validation failed", 
        errors: validationErrors 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: "Server error while creating report", 
      error: error.message 
    });
  }
});

router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Invalid report ID format" });
    }

    const oldReport = await DailySampleReport.findById(id).session(session);
    if (!oldReport) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Daily sample report not found" });
    }

    if (
      (updateData.qtyBigBox !== undefined && updateData.qtyBigBox < 0) ||
      (updateData.qtySmallBox !== undefined && updateData.qtySmallBox < 0) ||
      (updateData.totalQty !== undefined && updateData.totalQty < 0) ||
      (updateData.qtyPerBox !== undefined && updateData.qtyPerBox < 0)
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Quantities must be 0 or greater" });
    }

    if (updateData.date) {
      const parsedDate = new Date(updateData.date);
      if (isNaN(parsedDate)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Invalid date format" });
      }
      updateData.date = parsedDate;
    }

    // Update the report
    const updated = await DailySampleReport.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session
    });

    // Update stocks using old and new data
    await updateStockOnUpdate(oldReport, updated, session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Daily sample report updated successfully",
      data: updated,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Update error:", err);

    // 👇 NEW: Return insufficient stock error as a 400 with clear message
    if (err.message && err.message.startsWith('Insufficient stock')) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (err.name === "ValidationError") {
      const validationErrors = {};
      for (const field in err.errors) {
        validationErrors[field] = err.errors[field].message;
      }
      return res.status(400).json({ 
        success: false, 
        message: "Validation failed", 
        errors: validationErrors 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: "Server error while updating report", 
      error: err.message 
    });
  }
});

router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Invalid report ID format" });
    }

    const deleted = await DailySampleReport.findByIdAndDelete(id).session(session);
    if (!deleted) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Daily sample report not found" });
    }

    await updateStockOnDelete(deleted, session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Daily sample report deleted successfully",
      data: deleted,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Delete Error:", err);

    // Optional: handle insufficient stock on delete if ever needed
    if (err.message && err.message.startsWith('Insufficient stock')) {
      return res.status(400).json({ success: false, message: err.message });
    }

    res.status(500).json({ 
      success: false, 
      message: "Server error while deleting record", 
      error: err.message 
    });
  }
});

router.delete("/", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "No IDs provided for deletion" });
    }

    ids = ids.map((item) => (typeof item === "string" ? item : item.id));

    const validIds = [];
    ids.forEach((id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        validIds.push(new mongoose.Types.ObjectId(id));
      }
    });

    if (validIds.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "No valid IDs provided" });
    }

    const reportsToDelete = await DailySampleReport.find({ _id: { $in: validIds } }).session(session);

    const result = await DailySampleReport.deleteMany({ _id: { $in: validIds } }).session(session);

    for (const report of reportsToDelete) {
      try {
        await updateStockOnDelete(report, session);
      } catch (stockError) {
        console.error(`Failed to update stock for deleted report ${report.requestNumber}:`, stockError);
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} record(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk delete error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while deleting records", 
      error: error.message 
    });
  }
});

export default router;