import express from "express";
import mongoose from "mongoose";
import DailySampleReport from "../../models/reports/dailysample.js";
import Staff from "../../models/staffMember/staff.js";
import MRStockInHand from "../../models/sale/mrStockHand.js";      // ✅ added
import ReportInHand from "../../models/reports/reportsInHand.js";  // ✅ added

const router = express.Router();

function escapeRegex(str) {
  if (!str) return "";
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name.toLowerCase().trim().replace(/\s+/g, " ");
};

const findReportInHandFlexible = async (productName, session = null) => {
  try {
    const normalized = normalizeProductName(productName);
    let query = ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
    });
    if (session) query = query.session(session);
    let stock = await query;

    if (!stock) {
      const parts = normalized.split(/\s+/);
      const flexiblePattern = parts
        .map((p) => escapeRegex(p))
        .join("\\s*.*?\\s*");
      query = ReportInHand.findOne({
        productName: { $regex: new RegExp(flexiblePattern, "i") },
      });
      if (session) query = query.session(session);
      stock = await query;
    }

    if (!stock) {
      query = ReportInHand.findOne({
        productName: { $regex: new RegExp(escapeRegex(normalized), "i") },
      });
      if (session) query = query.session(session);
      stock = await query;
    }
    return stock;
  } catch (error) {
    console.error(`Error finding ReportInHand for ${productName}:`, error);
    throw error;
  }
};

const updateMRStock = async (
  mrName,
  productName,
  quantity,
  lc,
  session,
  isAdding = true,
) => {
  try {
    const warehouseProduct = await findReportInHandFlexible(
      productName,
      session,
    );
    if (!warehouseProduct) {
      console.warn(
        `Skipping MR stock update for "${productName}" – product not found in warehouse`,
      );
      return null;
    }

    const productId = warehouseProduct._id;

    const mr = await Staff.findOne({
      medicalRepName: { $regex: new RegExp(`^${escapeRegex(mrName)}$`, "i") },
    }).session(session);
    if (!mr) throw new Error(`MR "${mrName}" not found`);

    let mrStock = await MRStockInHand.findOne({ mrId: mr._id }).session(
      session,
    );
    if (!mrStock) {
      mrStock = new MRStockInHand({
        mrId: mr._id,
        mrName: mr.medicalRepName,
        productsInHand: [],
      });
    }

    const productIndex = mrStock.productsInHand.findIndex(
      (p) => p.productId && p.productId.toString() === productId.toString(),
    );

    if (productIndex === -1 && isAdding) {
      mrStock.productsInHand.push({
        productId,
        productName,
        quantity,
        lc: lc || 0,
        lastUpdated: new Date(),
      });
    } else if (productIndex !== -1) {
      if (isAdding) {
        mrStock.productsInHand[productIndex].quantity += quantity;
      } else {
        mrStock.productsInHand[productIndex].quantity -= quantity;
      }
      mrStock.productsInHand[productIndex].lastUpdated = new Date();

      if (mrStock.productsInHand[productIndex].quantity <= 0) {
        mrStock.productsInHand.splice(productIndex, 1);
      }
    } else if (!isAdding && productIndex === -1) {
      console.warn(
        `Cannot remove ${quantity} of "${productName}" from MR ${mrName} – product not in MR's stock`,
      );
      return null;
    }

    mrStock.updatedAt = new Date();
    await mrStock.save({ session });
    return mrStock;
  } catch (error) {
    console.error("Error updating MR stock:", error);
    throw error;
  }
};

const addStockToWarehouse = async (
  productName,
  quantity,
  adjustmentId,
  session = null,
) => {
  try {
    const reportInHand = await findReportInHandFlexible(productName, session);
    if (!reportInHand) {
      console.log(
        `Product "${productName}" not found in warehouse - cannot add stock`,
      );
      throw new Error(`Product "${productName}" not found in warehouse`);
    }

    reportInHand.batches.push({
      boxes: quantity,
      adjustmentType: "add",
      date: new Date(),
      adjustmentId: adjustmentId,
      productName: productName,
    });
    await reportInHand.save({ session });
    return reportInHand;
  } catch (error) {
    console.error(`Error adding stock for ${productName}:`, error);
    throw error;
  }
};

const removeStockFromWarehouse = async (
  productName,
  quantity,
  adjustmentId,
  session = null,
) => {
  try {
    const reportInHand = await findReportInHandFlexible(productName, session);
    if (!reportInHand) {
      console.log(
        `Product "${productName}" not found in warehouse - cannot remove stock`,
      );
      throw new Error(`Product "${productName}" not found in warehouse`);
    }

    if (reportInHand.totalBoxes < quantity) {
      throw new Error(
        `Insufficient stock for ${productName}. Available: ${reportInHand.totalBoxes}, Required: ${quantity}`,
      );
    }

    reportInHand.batches.push({
      boxes: quantity,
      adjustmentType: "remove",
      date: new Date(),
      adjustmentId: adjustmentId,
      productName: productName,
    });
    await reportInHand.save({ session });
    return reportInHand;
  } catch (error) {
    console.error(`Error removing stock for ${productName}:`, error);
    throw error;
  }
};

const updateStockOnAdd = async (dailySample, session = null) => {
  try {
    const { products, mrName, _id } = dailySample;
    for (const prod of products) {
      const { productName, totalQty } = prod;
      const qty = Number(totalQty);
      if (isNaN(qty) || qty <= 0) continue;

      await removeStockFromWarehouse(productName, qty, _id, session);
      await updateMRStock(mrName, productName, qty, 0, session, true);
    }
  } catch (error) {
    console.error("Error in updateStockOnAdd:", error);
    throw error;
  }
};

const updateStockOnDelete = async (dailySample, session = null) => {
  try {
    const { products, mrName, _id } = dailySample;
    for (const prod of products) {
      const { productName, totalQty } = prod;
      const qty = Number(totalQty);
      if (isNaN(qty) || qty <= 0) continue;

      await addStockToWarehouse(productName, qty, _id, session);
      await updateMRStock(mrName, productName, qty, 0, session, false);
    }
  } catch (error) {
    console.error("Error in updateStockOnDelete:", error);
    throw error;
  }
};

const updateStockOnUpdate = async (oldReport, newReport, session = null) => {
  try {
    const oldProducts = oldReport.products || [];
    const newProducts = newReport.products || [];
    const oldMrName = oldReport.mrName;
    const newMrName = newReport.mrName;

    const oldProductMap = new Map();
    oldProducts.forEach((p) => {
      oldProductMap.set(p.productName, {
        quantity: Number(p.totalQty),
        product: p,
      });
    });

    const newProductMap = new Map();
    newProducts.forEach((p) => {
      newProductMap.set(p.productName, {
        quantity: Number(p.totalQty),
        product: p,
      });
    });

    // Products removed
    for (const [productName, oldProd] of oldProductMap) {
      if (!newProductMap.has(productName)) {
        console.log(
          `Product removed: ${productName}, returning ${oldProd.quantity} to warehouse`,
        );
        await addStockToWarehouse(
          productName,
          oldProd.quantity,
          oldReport._id,
          session,
        );
        await updateMRStock(
          oldMrName,
          productName,
          oldProd.quantity,
          0,
          session,
          false,
        );
      }
    }

    // Products added
    for (const [productName, newProd] of newProductMap) {
      if (!oldProductMap.has(productName)) {
        console.log(
          `Product added: ${productName}, deducting ${newProd.quantity} from warehouse`,
        );
        await removeStockFromWarehouse(
          productName,
          newProd.quantity,
          newReport._id,
          session,
        );
        await updateMRStock(
          newMrName,
          productName,
          newProd.quantity,
          0,
          session,
          true,
        );
      }
    }

    // Quantity changed
    for (const [productName, newProd] of newProductMap) {
      const oldProd = oldProductMap.get(productName);
      if (oldProd) {
        const oldQty = oldProd.quantity;
        const newQty = newProd.quantity;
        if (oldQty !== newQty) {
          const difference = newQty - oldQty;
          console.log(
            `Product quantity changed: ${productName}, old: ${oldQty}, new: ${newQty}, difference: ${difference}`,
          );
          if (difference > 0) {
            await removeStockFromWarehouse(
              productName,
              difference,
              newReport._id,
              session,
            );
            await updateMRStock(
              newMrName,
              productName,
              difference,
              0,
              session,
              true,
            );
          } else if (difference < 0) {
            await addStockToWarehouse(
              productName,
              Math.abs(difference),
              newReport._id,
              session,
            );
            await updateMRStock(
              newMrName,
              productName,
              Math.abs(difference),
              0,
              session,
              false,
            );
          }
        }
      }
    }
  } catch (error) {
    console.error("Error in updateStockOnUpdate:", error);
    throw error;
  }
};

// ================== ROUTES ==================

router.post("/import", async (req, res) => {
  try {
    const data = req.body;
    if (!Array.isArray(data) || data.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No data provided" });
    }
    const validEntries = [];
    const invalidEntries = [];

    data.forEach((entry, index) => {
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
      const parsedDate = new Date(entry.date);
      if (isNaN(parsedDate)) {
        invalidEntries.push({
          index: index + 1,
          reason: "Invalid date",
          entry,
        });
        return;
      }
      validEntries.push({
        requestNumber: entry.requestNumber,
        date: parsedDate,
        mrName: entry.mrName,
        description: entry.description || "",
        products: [
          {
            productName: entry.productName,
            totalQty: Number(entry.totalQty) || 0,
          },
        ],
        remark: entry.remark || "",
        customerId: entry.customerId || null,
        customerName: entry.customerName || "",
        customerCode: entry.customerCode || "",
      });
    });

    if (validEntries.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No valid records", invalidEntries });
    }

    const result = await DailySampleReport.insertMany(validEntries, {
      ordered: false,
    });
    for (const entry of result) {
      try {
        await updateStockOnAdd(entry);
      } catch (err) {
        console.error(`Stock update failed for ${entry.requestNumber}:`, err);
      }
    }
    res.status(200).json({
      success: true,
      message: "Daily sample reports imported",
      data: {
        imported: result.length,
        failed: invalidEntries.length,
        invalidEntries: invalidEntries.length ? invalidEntries : undefined,
      },
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
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
    if (requestNumber)
      query.requestNumber = { $regex: requestNumber, $options: "i" };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    if (productName)
      query["products.productName"] = { $regex: productName, $options: "i" };

    const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const reports = await DailySampleReport.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    const total = await DailySampleReport.countDocuments(query);
    res.status(200).json({
      success: true,
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
      { $unwind: "$products" },
      {
        $group: {
          _id: null,
          totalReports: { $sum: 1 },
          totalQty: { $sum: "$products.totalQty" },
        },
      },
    ]);
    const statsByMR = await DailySampleReport.aggregate([
      { $match: matchStage },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$mrName",
          reportCount: { $sum: 1 },
          totalQty: { $sum: "$products.totalQty" },
        },
      },
      { $sort: { reportCount: -1 } },
      { $limit: 10 },
    ]);
    const statsByProduct = await DailySampleReport.aggregate([
      { $match: matchStage },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.productName",
          reportCount: { $sum: 1 },
          totalQty: { $sum: "$products.totalQty" },
        },
      },
      { $sort: { totalQty: -1 } },
      { $limit: 10 },
    ]);
    res.status(200).json({
      success: true,
      data: {
        summary: overallStats[0] || { totalReports: 0, totalQty: 0 },
        byMR: statsByMR,
        byProduct: statsByProduct,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid ID" });
    const report = await DailySampleReport.findById(id).lean();
    if (!report)
      return res.status(404).json({ success: false, message: "Not found" });
    res.status(200).json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
      products,
      remark,
      customerId,
      customerName,
      customerCode,
    } = req.body;

    if (
      !date ||
      !mrName ||
      !products ||
      !Array.isArray(products) ||
      products.length === 0
    ) {
      throw new Error("Date, MR name, and at least one product are required");
    }

    for (const prod of products) {
      if (
        !prod.productName ||
        prod.totalQty === undefined ||
        prod.totalQty <= 0
      ) {
        throw new Error("Each product must have a name and positive quantity");
      }
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) throw new Error("Invalid date");

    const report = new DailySampleReport({
      date: parsedDate,
      mrId: mrId || null,
      mrName,
      products: products.map((p) => ({
        productName: p.productName,
        totalQty: Number(p.totalQty),
      })),
      remark: remark || "",
      customerId: customerId || null,
      customerName: customerName || "",
      customerCode: customerCode || "",
    });

    await report.save({ session });
    await updateStockOnAdd(report, session);

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: "Daily sample report added",
      data: report,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid ID");
    }

    const oldReport = await DailySampleReport.findById(id).session(session);
    if (!oldReport) {
      throw new Error("Report not found");
    }

    const updateData = req.body;

    if (updateData.date) {
      const parsed = new Date(updateData.date);
      if (isNaN(parsed)) {
        throw new Error("Invalid date");
      }
      updateData.date = parsed;
    }

    if (updateData.products) {
      for (const prod of updateData.products) {
        if (!prod.productName || prod.totalQty <= 0) {
          throw new Error("Invalid product data");
        }
      }
    }

    // Update stock based on changes
    if (updateData.products) {
      const updatedReport = {
        ...oldReport.toObject(),
        ...updateData,
        products: updateData.products,
        _id: oldReport._id,
        mrName: updateData.mrName || oldReport.mrName,
      };
      await updateStockOnUpdate(oldReport, updatedReport, session);
    }

    const updated = await DailySampleReport.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });

    if (!updated) {
      throw new Error("Failed to update report");
    }

    console.log(`✅ Daily sample report updated: ${updated._id}`);

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
    console.error("Error updating daily sample report:", err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid ID");

    const deleted =
      await DailySampleReport.findByIdAndDelete(id).session(session);
    if (!deleted) throw new Error("Not found");

    await updateStockOnDelete(deleted, session);

    await session.commitTransaction();
    session.endSession();
    res.status(200).json({ success: true, message: "Deleted", data: deleted });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete("/", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("No IDs");
    ids = ids.map((id) => new mongoose.Types.ObjectId(id));
    const reportsToDelete = await DailySampleReport.find({
      _id: { $in: ids },
    }).session(session);
    const result = await DailySampleReport.deleteMany({
      _id: { $in: ids },
    }).session(session);

    for (const report of reportsToDelete) {
      await updateStockOnDelete(report, session);
    }

    await session.commitTransaction();
    session.endSession();
    res.status(200).json({
      success: true,
      message: `${result.deletedCount} deleted`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;