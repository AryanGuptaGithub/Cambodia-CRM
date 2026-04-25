import express from "express";
import ActivityLog from "../../models/activity/activityLog.js";
import mongoose from "mongoose";
import Staff from "../../models/staffMember/staff.js";
import User from "../../models/User.js";
import XLSX from "xlsx";
import { protect } from "../../middleware/auth.js";

const TABLE_MODEL_MAP = {
  customers: () => import("../../models/master/customer.js"),
  suppliers: () => import("../../models/master/supplier.js"),
  sales: () => import("../../models/sale/saleSummary.js"),
  purchase: () => import("../../models/purcharsing/purchaseInventory.js"),
  products: () => import("../../models/projectManger/product.js"),
  expenses: () => import("../../models/expenses/addExpense.js"),
  staff: () => import("../../models/staffMember/staff.js"),
  StockAdjustment: () => import("../../models/stock/stockAdjustment.js"),
  stockadjustments: () => import("../../models/stock/stockAdjustment.js"),
  stockTransfer: () => import("../../models/stock/stockTransfer.js"),
  purchaseReturn: () => import("../../models/purcharsing/purchaseReturns.js"),
  paymentsOut: () => import("../../models/purcharsing/purchaseOut.js"),
  salesReturn: () => import("../../models/sale/saleReturn.js"),
  transactions: () => import("../../models/accounts/Transaction.js"),
  mrcashes: () => import("../../models/accounts/MRCash.js"),
  addexpensecategaries: () =>
    import("../../models/expenses/addExpenseCategary.js"),
  mrbasicpayrolls: () => import("../../models/Hrm/MRBasicPayroll.js"),
};

const router = express.Router();

const formatDateTime = (date) => {
  if (!date) return "";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "long" });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${day} ${month} ${year} ${time}`;
};

const buildSnapshots = (raw, refField = "customerCode") => {
  if (!raw) return undefined;
  const rows = Array.isArray(raw) ? raw : [raw];
  return rows.map((doc) => ({
    recordId: doc._id ? String(doc._id) : undefined,
    refNumber:
      doc[refField] || doc.referenceNumber || doc.invoiceNumber || undefined,
    data: doc,
  }));
};

export const logActivity = async (req, options = {}) => {
  try {
    const {
      action,
      actionLabel,
      tableName,
      tableLabel,
      recordId,
      referenceNumber,
      previousData,
      newData,
      description,
      previousSnapshots,
      newSnapshots,
      refField = "customerCode",
    } = options;

    const user = req.user || {};
    const userId = user._id || user.id || null;

    const prevSnaps =
      previousSnapshots ?? buildSnapshots(previousData, refField);
    const newSnaps = newSnapshots ?? buildSnapshots(newData, refField);

    await ActivityLog.create({
      userId,
      userName: user.name || user.userName || "System",
      userRole: user.role || null,
      userEmail: user.email || null,
      action,
      actionLabel: actionLabel || null,
      tableName,
      tableLabel: tableLabel || null,
      recordId: recordId ? String(recordId) : null,
      referenceNumber: referenceNumber || null,
      previousSnapshots: prevSnaps,
      newSnapshots: newSnaps,
      previousData: previousData || null,
      newData: newData || null,
      ipAddress:
        req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || null,
      userAgent: req.headers["user-agent"] || null,
      description: description || null,
    });
  } catch (err) {
    console.error("❌ ActivityLog write failed:", err.message);
  }
};

// Helper function for precision
const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 100) / 100;
};


const applyStockAdjustmentToReport = async (
  adjustmentData,
  isRevert = false,
) => {
  try {
    const ReportInHand = (await import("../../models/reports/reportsInHand.js"))
      .default;

    // Extract adjustment data
    let adjustmentType, boxes, lc, adjustmentId, productName;

    if (adjustmentData.adjustmentType) {
      adjustmentType = adjustmentData.adjustmentType;
      boxes = Number(adjustmentData.boxQuantity || adjustmentData.boxes || 0);
      lc = Number(adjustmentData.unitCost || adjustmentData.lc || 0);
      adjustmentId = adjustmentData._id;
      productName = adjustmentData.productName;
    } else if (adjustmentData.data) {
      const data = adjustmentData.data;
      adjustmentType = data.adjustmentType;
      boxes = Number(data.boxQuantity || data.boxes || 0);
      lc = Number(data.unitCost || data.lc || 0);
      adjustmentId = data._id;
      productName = data.productName;
    } else {
      adjustmentType = adjustmentData.adjustmentType;
      boxes = Number(adjustmentData.boxQuantity || 0);
      lc = Number(adjustmentData.unitCost || 0);
      adjustmentId = adjustmentData._id;
      productName = adjustmentData.productName;
    }

    if (!productName) {
      console.warn("⚠️ No product name found in adjustment data");
      return;
    }

    const productNameLower = productName.toLowerCase().trim();
    if (!productNameLower) return;

    if (boxes <= 0) {
      console.warn(`⚠️ No boxes to process for product "${productName}"`);
      return;
    }

    const existingReport = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productNameLower}$`, "i") },
    });

    if (!existingReport) {
      console.warn(`⚠️ No ReportInHand found for product "${productName}"`);
      return;
    }

    let batches = [...(existingReport.batches || [])];
    let updated = false;

    if (!isRevert) {
      // NORMAL OPERATION - Apply the adjustment as is
      if (adjustmentType === "add") {
        // ADD stock: Create a new add batch
        const amount = fixPrecision(boxes * lc);
        const newBatch = {
          _id: new mongoose.Types.ObjectId(),
          boxes: boxes,
          lc: lc,
          fob: Number(adjustmentData.fob || 0),
          cif: Number(adjustmentData.cif || 0),
          amount: amount,
          sellingPrice: Number(adjustmentData.sellingPrice || 0),
          expiryDate: adjustmentData.expiryDate
            ? new Date(adjustmentData.expiryDate)
            : null,
          date: adjustmentData.date
            ? new Date(adjustmentData.date)
            : new Date(),
          adjustmentType: "add",
          adjustmentId: adjustmentId,
          batchNumber: `ADJ-ADD-${Date.now()}`,
          isReversal: false,
        };
        batches.push(newBatch);
        updated = true;
        console.log(
          `✅ Applied ADD for product "${productName}": +${boxes} boxes, amount: ${amount}`,
        );
      } else if (adjustmentType === "remove") {
        // REMOVE stock: Need to remove boxes from existing stock
        let remainingToRemove = boxes;
        const updatedBatches = [];

        // Sort batches by date (oldest first) for FIFO removal
        const sortedBatches = [...batches].sort(
          (a, b) => new Date(a.date || 0) - new Date(b.date || 0),
        );

        for (const batch of sortedBatches) {
          if (remainingToRemove <= 0) {
            updatedBatches.push(batch);
            continue;
          }

          // Only remove from stock batches (batch type or add type)
          if (
            batch.adjustmentType === "batch" ||
            batch.adjustmentType === "add"
          ) {
            const currentBoxes = Number(batch.boxes || 0);
            if (currentBoxes <= remainingToRemove) {
              // Remove entire batch
              remainingToRemove -= currentBoxes;
              // Don't add this batch (it's fully removed)
            } else {
              // Partially remove from this batch
              const newBoxes = fixPrecision(currentBoxes - remainingToRemove);
              batch.boxes = newBoxes;
              batch.amount = fixPrecision(newBoxes * Number(batch.lc || 0));
              updatedBatches.push(batch);
              remainingToRemove = 0;
            }
          } else {
            // Keep non-stock batches (remove adjustments, returns, etc.)
            updatedBatches.push(batch);
          }
        }

        // Create a removal record for tracking
        const removalBatch = {
          _id: new mongoose.Types.ObjectId(),
          boxes: boxes,
          lc: lc,
          fob: Number(adjustmentData.fob || 0),
          cif: Number(adjustmentData.cif || 0),
          amount: fixPrecision(boxes * lc),
          sellingPrice: Number(adjustmentData.sellingPrice || 0),
          expiryDate: adjustmentData.expiryDate
            ? new Date(adjustmentData.expiryDate)
            : null,
          date: adjustmentData.date
            ? new Date(adjustmentData.date)
            : new Date(),
          adjustmentType: "remove",
          adjustmentId: adjustmentId,
          batchNumber: `ADJ-REMOVE-${Date.now()}`,
          isReversal: false,
        };
        updatedBatches.push(removalBatch);

        batches = updatedBatches;
        updated = true;
        const removedQty = boxes - remainingToRemove;
        console.log(
          `✅ Applied REMOVE for "${productName}": -${removedQty} boxes`,
        );
      }
    } else {
      // REVERT OPERATION - Do the opposite of the original adjustment
      if (adjustmentType === "add") {
        // Reverting an ADD: Remove the add batch and restore stock
        // Find and remove the specific add batch
        let batchIndex = batches.findIndex(
          (b) =>
            b.adjustmentId &&
            b.adjustmentId.toString() === adjustmentId?.toString(),
        );

        if (batchIndex !== -1) {
          // Remove the add batch
          batches.splice(batchIndex, 1);
          updated = true;
          console.log(
            `✅ Reverted ADD for product "${productName}": Removed add batch`,
          );
        } else {
          console.warn(
            `⚠️ Could not find add batch to revert for adjustment ${adjustmentId}`,
          );
        }
      } else if (adjustmentType === "remove") {
        // Reverting a REMOVE: Add the stock back
        // Find the removal batch by adjustmentId
        let removalBatchIndex = batches.findIndex(
          (b) =>
            b.adjustmentType === "remove" &&
            b.adjustmentId &&
            b.adjustmentId.toString() === adjustmentId?.toString(),
        );

        if (removalBatchIndex !== -1) {
          // Remove the removal batch
          batches.splice(removalBatchIndex, 1);

          // Now add the stock back to the batches
          let remainingToAdd = boxes;

          // First try to find a batch with the same LC that we can add back to
          let foundBatch = false;
          for (const batch of batches) {
            if (remainingToAdd <= 0) break;

            if (
              (batch.adjustmentType === "batch" ||
                batch.adjustmentType === "add") &&
              Math.abs(Number(batch.lc || 0) - lc) < 0.0001
            ) {
              // Add to existing batch with same LC
              batch.boxes = fixPrecision(
                Number(batch.boxes || 0) + remainingToAdd,
              );
              batch.amount = fixPrecision(
                Number(batch.boxes) * Number(batch.lc || 0),
              );
              remainingToAdd = 0;
              foundBatch = true;
              break;
            }
          }

          // If no matching batch found, create a new restore batch
          if (!foundBatch && remainingToAdd > 0) {
            const restoreBatch = {
              _id: new mongoose.Types.ObjectId(),
              boxes: remainingToAdd,
              lc: lc,
              fob: Number(adjustmentData.fob || 0),
              cif: Number(adjustmentData.cif || 0),
              amount: fixPrecision(remainingToAdd * lc),
              sellingPrice: Number(adjustmentData.sellingPrice || 0),
              expiryDate: adjustmentData.expiryDate
                ? new Date(adjustmentData.expiryDate)
                : null,
              date: adjustmentData.date
                ? new Date(adjustmentData.date)
                : new Date(),
              adjustmentType: "add", // Add back as an add batch
              adjustmentId: adjustmentId,
              batchNumber: `REVERT-RESTORE-${Date.now()}`,
              isReversal: true,
            };
            batches.push(restoreBatch);
          }

          updated = true;
          console.log(
            `✅ Reverted REMOVE for product "${productName}": Added back ${boxes} boxes`,
          );
        } else {
          console.warn(
            `⚠️ Could not find removal batch to revert for adjustment ${adjustmentId}`,
          );
        }
      }
    }

    if (!updated) {
      console.warn(`⚠️ No changes made for product "${productName}"`);
      return;
    }

    // Recalculate all totals
    let totalBoxesFromBatches = 0;
    let addStockAdjustment = 0;
    let removeStockAdjustment = 0;
    let returnStockAdjustment = 0;
    let totalAmount = 0;

    for (const batch of batches) {
      const type = batch.adjustmentType;
      const batchBoxes = Number(batch.boxes || 0);
      const batchAmount = Number(batch.amount || 0);

      if (type === "batch") {
        totalBoxesFromBatches += batchBoxes;
        totalAmount += batchAmount;
      } else if (type === "return") {
        returnStockAdjustment += batchBoxes;
        totalAmount += batchAmount;
      } else if (type === "add") {
        addStockAdjustment += batchBoxes;
        totalAmount += batchAmount;
      } else if (type === "remove") {
        removeStockAdjustment += batchBoxes;
        // Remove batches don't contribute to total amount (they represent stock taken out)
        // but we track the quantity separately
      }
    }

    const totalBoxes = fixPrecision(
      totalBoxesFromBatches +
        addStockAdjustment +
        returnStockAdjustment -
        removeStockAdjustment,
    );
    const fixedAmount = fixPrecision(totalAmount);
    const averagePrice =
      totalBoxes > 0 ? fixPrecision(fixedAmount / totalBoxes) : 0;

    let status = "In Stock";
    if (totalBoxes <= 0) status = "Out of Stock";
    else if (totalBoxes < (existingReport.minStockLevel || 10))
      status = "Low Stock";

    await ReportInHand.updateOne(
      { _id: existingReport._id },
      {
        $set: {
          batches: batches,
          totalBoxesFromBatches: fixPrecision(totalBoxesFromBatches),
          addStockAdjustment: fixPrecision(addStockAdjustment),
          removeStockAdjustment: fixPrecision(removeStockAdjustment),
          returnStockAdjustment: fixPrecision(returnStockAdjustment),
          totalBoxes: totalBoxes,
          totalAmount: fixedAmount,
          averagePrice: averagePrice,
          status: status,
          updatedAt: new Date(),
        },
      },
    );

    const actionText = isRevert ? "Reverted" : "Applied";
    const adjType = adjustmentType === "add" ? "ADD" : "REMOVE";
    console.log(
      `✅ ${actionText} ${adjType} for "${productName}": ${boxes} boxes. New total: ${totalBoxes} boxes, amount: ${fixedAmount}`,
    );
  } catch (err) {
    console.error("❌ applyStockAdjustmentToReport failed:", err.message);
    throw err;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PURCHASE helpers
// ─────────────────────────────────────────────────────────────────────────────
const removePurchaseInvoiceBatchesFromStock = async (invoiceData) => {
  try {
    const ReportInHand = (await import("../../models/reports/reportsInHand.js"))
      .default;

    const products = invoiceData.products || [];
    const invoiceNumber = invoiceData.invoiceNumber || "unknown";

    for (const product of products) {
      const productName = (product.productName || "").toLowerCase().trim();
      if (!productName) continue;

      const qty = Number(product.quantityPerBoxStrip || 0);
      if (qty <= 0) continue;

      const lcValue = Number(product.lc || 0);
      const fobValue = Number(product.fob || 0);
      const cifValue = Number(product.cif || 0);
      const expiryTime = product.expiryDate
        ? new Date(product.expiryDate).getTime()
        : null;

      const existingReport = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });

      if (!existingReport) {
        console.warn(
          `⚠️ No ReportInHand found for product "${productName}" — skipping`,
        );
        continue;
      }

      const batches = [...(existingReport.batches || [])];
      let removed = false;
      const updatedBatches = [];

      for (const batch of batches) {
        if (removed) {
          updatedBatches.push(batch);
          continue;
        }

        if (batch.adjustmentType && batch.adjustmentType !== "batch") {
          updatedBatches.push(batch);
          continue;
        }

        const batchExpiry = batch.expiryDate
          ? new Date(batch.expiryDate).getTime()
          : null;
        const lcMatch = Math.abs(Number(batch.lc || 0) - lcValue) < 0.0001;
        const fobMatch = Math.abs(Number(batch.fob || 0) - fobValue) < 0.0001;
        const cifMatch = Math.abs(Number(batch.cif || 0) - cifValue) < 0.0001;
        const expiryMatch = batchExpiry === expiryTime;
        const qtyMatch = Number(batch.boxes || 0) === qty;

        if (lcMatch && fobMatch && cifMatch && expiryMatch && qtyMatch) {
          removed = true;
          continue;
        }

        if (
          lcMatch &&
          fobMatch &&
          cifMatch &&
          expiryMatch &&
          Number(batch.boxes || 0) > qty
        ) {
          const newBoxes = Number(batch.boxes) - qty;
          updatedBatches.push({
            ...(batch.toObject ? batch.toObject() : batch),
            boxes: newBoxes,
            amount: fixPrecision(newBoxes * lcValue),
          });
          removed = true;
          continue;
        }

        updatedBatches.push(batch);
      }

      if (!removed) {
        let remaining = qty;
        const fifoResult = [];
        const sortable = updatedBatches
          .slice()
          .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

        for (const batch of sortable) {
          if (remaining <= 0) {
            fifoResult.push(batch);
            continue;
          }
          if (batch.adjustmentType && batch.adjustmentType !== "batch") {
            fifoResult.push(batch);
            continue;
          }
          const available = Number(batch.boxes || 0);
          if (available <= remaining) {
            remaining -= available;
          } else {
            const newBoxes = available - remaining;
            fifoResult.push({
              ...(batch.toObject ? batch.toObject() : batch),
              boxes: newBoxes,
              amount: fixPrecision(newBoxes * Number(batch.lc || 0)),
            });
            remaining = 0;
          }
        }

        const realBatches = fifoResult.filter(
          (b) => !b.adjustmentType || b.adjustmentType === "batch",
        );
        const totalBoxesFromBatches = realBatches.reduce(
          (s, b) => s + (Number(b.boxes) || 0),
          0,
        );
        const totalAmount = realBatches.reduce(
          (s, b) => s + (Number(b.amount) || 0),
          0,
        );
        const addAdj = Number(existingReport.addStockAdjustment || 0);
        const removeAdj = Number(existingReport.removeStockAdjustment || 0);
        const totalBoxes = Math.max(
          0,
          totalBoxesFromBatches + addAdj - removeAdj,
        );
        const averagePrice =
          totalBoxesFromBatches > 0 ? totalAmount / totalBoxesFromBatches : 0;

        let status = "In Stock";
        if (totalBoxes <= 0) status = "Out of Stock";
        else if (totalBoxes < (existingReport.minStockLevel || 10))
          status = "Low Stock";

        await ReportInHand.updateOne(
          { _id: existingReport._id },
          {
            $set: {
              batches: fifoResult,
              totalBoxesFromBatches: fixPrecision(totalBoxesFromBatches),
              totalBoxes: fixPrecision(totalBoxes),
              totalAmount: fixPrecision(totalAmount),
              averagePrice: fixPrecision(averagePrice),
              status,
              updatedAt: new Date(),
            },
          },
        );
        continue;
      }

      const realBatches = updatedBatches.filter(
        (b) => !b.adjustmentType || b.adjustmentType === "batch",
      );
      const totalBoxesFromBatches = realBatches.reduce(
        (s, b) => s + (Number(b.boxes) || 0),
        0,
      );
      const totalAmount = realBatches.reduce(
        (s, b) => s + (Number(b.amount) || 0),
        0,
      );
      const addAdj = Number(existingReport.addStockAdjustment || 0);
      const removeAdj = Number(existingReport.removeStockAdjustment || 0);
      const totalBoxes = Math.max(
        0,
        totalBoxesFromBatches + addAdj - removeAdj,
      );
      const averagePrice =
        totalBoxesFromBatches > 0 ? totalAmount / totalBoxesFromBatches : 0;

      let status = "In Stock";
      if (totalBoxes <= 0) status = "Out of Stock";
      else if (totalBoxes < (existingReport.minStockLevel || 10))
        status = "Low Stock";

      await ReportInHand.updateOne(
        { _id: existingReport._id },
        {
          $set: {
            batches: updatedBatches,
            totalBoxesFromBatches: fixPrecision(totalBoxesFromBatches),
            totalBoxes: fixPrecision(totalBoxes),
            totalAmount: fixPrecision(totalAmount),
            averagePrice: fixPrecision(averagePrice),
            status,
            updatedAt: new Date(),
          },
        },
      );
    }
  } catch (err) {
    console.error(
      "❌ removePurchaseInvoiceBatchesFromStock failed:",
      err.message,
    );
  }
};

const restorePurchaseInvoiceBatchesToStock = async (invoiceData) => {
  try {
    const ReportInHand = (await import("../../models/reports/reportsInHand.js"))
      .default;

    const products = invoiceData.products || [];
    const invoiceNumber = invoiceData.invoiceNumber || "unknown";

    for (const product of products) {
      const productName = (product.productName || "").toLowerCase().trim();
      if (!productName) continue;

      const qty = Number(product.quantityPerBoxStrip || 0);
      if (qty <= 0) continue;

      const lcValue = Number(product.lc || 0);
      const fobValue = Number(product.fob || 0);
      const cifValue = Number(product.cif || 0);
      const amount = fixPrecision(qty * lcValue);
      const expiryDate = product.expiryDate
        ? new Date(product.expiryDate)
        : null;

      const newBatch = {
        boxes: qty,
        lc: lcValue,
        fob: fobValue,
        cif: cifValue,
        amount,
        expiryDate,
        date: product.date ? new Date(product.date) : new Date(),
        _id: new mongoose.Types.ObjectId(),
        adjustmentType: "batch",
        sellingPrice: Number(product.sellingPrice || 0),
      };

      const existingReport = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });

      if (existingReport) {
        const updatedBatches = [...(existingReport.batches || []), newBatch];
        const realBatches = updatedBatches.filter(
          (b) => !b.adjustmentType || b.adjustmentType === "batch",
        );
        const totalBoxesFromBatches = realBatches.reduce(
          (s, b) => s + (Number(b.boxes) || 0),
          0,
        );
        const totalAmount = realBatches.reduce(
          (s, b) => s + (Number(b.amount) || 0),
          0,
        );
        const addAdj = Number(existingReport.addStockAdjustment || 0);
        const removeAdj = Number(existingReport.removeStockAdjustment || 0);
        const totalBoxes = Math.max(
          0,
          totalBoxesFromBatches + addAdj - removeAdj,
        );
        const averagePrice =
          totalBoxesFromBatches > 0 ? totalAmount / totalBoxesFromBatches : 0;

        let status = "In Stock";
        if (totalBoxes <= 0) status = "Out of Stock";
        else if (totalBoxes < (existingReport.minStockLevel || 10))
          status = "Low Stock";

        await ReportInHand.updateOne(
          { _id: existingReport._id },
          {
            $set: {
              batches: updatedBatches,
              totalBoxesFromBatches: fixPrecision(totalBoxesFromBatches),
              totalBoxes: fixPrecision(totalBoxes),
              totalAmount: fixPrecision(totalAmount),
              averagePrice: fixPrecision(averagePrice),
              status,
              updatedAt: new Date(),
            },
          },
        );
      } else {
        await ReportInHand.create({
          productName,
          supplierName: invoiceData.supplierName || "Unknown",
          type: product.type || "",
          sellingPrice: Number(product.sellingPrice || 0),
          batches: [newBatch],
          totalBoxesFromBatches: qty,
          totalBoxes: qty,
          totalAmount: amount,
          averagePrice: lcValue,
          addStockAdjustment: 0,
          removeStockAdjustment: 0,
          status: qty > 0 ? "In Stock" : "Out of Stock",
          minStockLevel: 10,
        });
      }
    }
  } catch (err) {
    console.error(
      "❌ restorePurchaseInvoiceBatchesToStock failed:",
      err.message,
    );
  }
};

const recalculateAllReportInHandTotals = async () => {
  try {
    const ReportInHand = (await import("../../models/reports/reportsInHand.js"))
      .default;
    const allReports = await ReportInHand.find({}).lean();

    for (const report of allReports) {
      try {
        const batches = report.batches || [];
        let totalBoxesFromBatches = 0;
        let addStockAdjustment = 0;
        let removeStockAdjustment = 0;
        let returnStockAdjustment = 0;
        let totalAmount = 0;

        for (const batch of batches) {
          const type = batch.adjustmentType;
          const batchBoxes = Number(batch.boxes || 0);
          const batchAmount = Number(batch.amount || 0);

          if (type === "batch") {
            totalBoxesFromBatches += batchBoxes;
            totalAmount += batchAmount;
          } else if (type === "return") {
            returnStockAdjustment += batchBoxes;
            totalAmount += batchAmount;
          } else if (type === "add") {
            addStockAdjustment += batchBoxes;
            totalAmount += batchAmount;
          } else if (type === "remove") {
            removeStockAdjustment += batchBoxes;
            totalAmount -= batchAmount;
          }
        }

        const totalBoxes = Math.max(
          0,
          totalBoxesFromBatches +
            addStockAdjustment +
            returnStockAdjustment -
            removeStockAdjustment,
        );
        const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

        let status = "In Stock";
        if (totalBoxes <= 0) status = "Out of Stock";
        else if (totalBoxes < (report.minStockLevel || 10))
          status = "Low Stock";

        await ReportInHand.updateOne(
          { _id: report._id },
          {
            $set: {
              totalBoxesFromBatches: fixPrecision(totalBoxesFromBatches),
              addStockAdjustment: fixPrecision(addStockAdjustment),
              removeStockAdjustment: fixPrecision(removeStockAdjustment),
              returnStockAdjustment: fixPrecision(returnStockAdjustment),
              totalBoxes: fixPrecision(totalBoxes),
              totalAmount: fixPrecision(totalAmount),
              averagePrice: fixPrecision(averagePrice),
              status,
              updatedAt: new Date(),
            },
          },
        );
      } catch (err) {
        console.error(
          `❌ Failed to recalculate stock for "${report.productName}":`,
          err.message,
        );
      }
    }
    console.log("✅ All ReportInHand totals recalculated after revert");
  } catch (err) {
    console.error("❌ recalculateAllReportInHandTotals failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SALE helpers
// ─────────────────────────────────────────────────────────────────────────────
const restoreSaleDeductionsToStock = async (saleData) => {
  try {
    const ReportInHand = (await import("../../models/reports/reportsInHand.js"))
      .default;
    const products = saleData.products || [];

    for (const product of products) {
      const productName = (product.productName || "").toLowerCase().trim();
      if (!productName) continue;

      const salesQty = Number(product.salesQty || 0);
      const bonusQty = Number(product.bonusQty || 0);
      const totalQty = salesQty + bonusQty;
      if (totalQty <= 0) continue;

      if (saleData.saleType === "MR Sale") continue;

      const existingReport = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });

      if (!existingReport) {
        console.warn(
          `⚠️ ReportInHand not found for "${productName}" — skipping restore`,
        );
        continue;
      }

      const lcValue = Number(product.lc || 0);
      let remainingToRestore = totalQty;

      const batches = (existingReport.batches || []).map((b) =>
        b.toObject ? b.toObject() : { ...b },
      );

      const realBatchIndicesByNewest = batches
        .map((b, idx) => ({ idx, b }))
        .filter(({ b }) => !b.adjustmentType || b.adjustmentType === "batch")
        .sort((a, b_) => {
          const dateA = a.b.date ? new Date(a.b.date) : new Date(0);
          const dateB = b_.b.date ? new Date(b_.b.date) : new Date(0);
          return dateB - dateA;
        });

      for (const { idx } of realBatchIndicesByNewest) {
        if (remainingToRestore <= 0) break;
        const batchLC = Number(batches[idx].lc ?? lcValue);
        const newBoxes = fixPrecision(
          Number(batches[idx].boxes || 0) + remainingToRestore,
        );
        batches[idx].boxes = newBoxes;
        batches[idx].amount = fixPrecision(newBoxes * batchLC);
        remainingToRestore = 0;
      }

      if (remainingToRestore > 0) {
        batches.push({
          batchNumber: `RESTORE-${Date.now()}`,
          boxes: remainingToRestore,
          lc: lcValue,
          fob: Number(product.fob || 0),
          cif: Number(product.cif || 0),
          amount: fixPrecision(remainingToRestore * lcValue),
          expiryDate: null,
          date: new Date(),
          adjustmentType: "batch",
        });
      }

      const prevRemoveAdj = Number(existingReport.removeStockAdjustment || 0);
      const newRemoveAdj = Math.max(0, prevRemoveAdj - totalQty);

      const realBatches = batches.filter(
        (b) => !b.adjustmentType || b.adjustmentType === "batch",
      );
      const totalBoxesFromBatches = realBatches.reduce(
        (s, b) => s + (Number(b.boxes) || 0),
        0,
      );
      const totalAmount = realBatches.reduce(
        (s, b) => s + (Number(b.amount) || 0),
        0,
      );
      const addAdj = Number(existingReport.addStockAdjustment || 0);
      const totalBoxes = Math.max(
        0,
        totalBoxesFromBatches + addAdj - newRemoveAdj,
      );
      const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

      let status = "In Stock";
      if (totalBoxes <= 0) status = "Out of Stock";
      else if (totalBoxes < (existingReport.minStockLevel || 10))
        status = "Low Stock";

      await ReportInHand.updateOne(
        { _id: existingReport._id },
        {
          $set: {
            batches,
            totalBoxesFromBatches: fixPrecision(totalBoxesFromBatches),
            totalBoxes: fixPrecision(totalBoxes),
            totalAmount: fixPrecision(totalAmount),
            averagePrice: fixPrecision(averagePrice),
            removeStockAdjustment: fixPrecision(newRemoveAdj),
            status,
            updatedAt: new Date(),
          },
        },
      );
    }
  } catch (err) {
    console.error("❌ restoreSaleDeductionsToStock failed:", err.message);
  }
};

const removeSaleDeductionsFromStock = async (saleData) => {
  try {
    const ReportInHand = (await import("../../models/reports/reportsInHand.js"))
      .default;
    const products = saleData.products || [];

    for (const product of products) {
      const productName = (product.productName || "").toLowerCase().trim();
      if (!productName) continue;

      const salesQty = Number(product.salesQty || 0);
      const bonusQty = Number(product.bonusQty || 0);
      const totalQty = salesQty + bonusQty;
      if (totalQty <= 0) continue;

      if (saleData.saleType === "MR Sale") continue;

      const existingReport = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });

      if (!existingReport) continue;

      const batches = (existingReport.batches || []).map((b) =>
        b.toObject ? b.toObject() : { ...b },
      );

      const realBatchIndicesByOldest = batches
        .map((b, idx) => ({ idx, b }))
        .filter(({ b }) => !b.adjustmentType || b.adjustmentType === "batch")
        .sort((a, b_) => {
          const dateA = a.b.date ? new Date(a.b.date) : new Date(0);
          const dateB = b_.b.date ? new Date(b_.b.date) : new Date(0);
          return dateA - dateB;
        });

      let remaining = totalQty;
      for (const { idx } of realBatchIndicesByOldest) {
        if (remaining <= 0) break;
        const batchBoxes = Number(batches[idx].boxes || 0);
        const batchLC = Number(batches[idx].lc || 0);
        const deduct = Math.min(batchBoxes, remaining);
        const newBoxes = fixPrecision(batchBoxes - deduct);
        batches[idx].boxes = newBoxes;
        batches[idx].amount = fixPrecision(newBoxes * batchLC);
        remaining = fixPrecision(remaining - deduct);
      }

      const prevRemoveAdj = Number(existingReport.removeStockAdjustment || 0);
      const newRemoveAdj = prevRemoveAdj + totalQty;

      const realBatches = batches.filter(
        (b) => !b.adjustmentType || b.adjustmentType === "batch",
      );
      const totalBoxesFromBatches = realBatches.reduce(
        (s, b) => s + (Number(b.boxes) || 0),
        0,
      );
      const totalAmount = realBatches.reduce(
        (s, b) => s + (Number(b.amount) || 0),
        0,
      );
      const addAdj = Number(existingReport.addStockAdjustment || 0);
      const totalBoxes = Math.max(
        0,
        totalBoxesFromBatches + addAdj - newRemoveAdj,
      );
      const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

      let status = "In Stock";
      if (totalBoxes <= 0) status = "Out of Stock";
      else if (totalBoxes < (existingReport.minStockLevel || 10))
        status = "Low Stock";

      await ReportInHand.updateOne(
        { _id: existingReport._id },
        {
          $set: {
            batches,
            totalBoxesFromBatches: fixPrecision(totalBoxesFromBatches),
            totalBoxes: fixPrecision(totalBoxes),
            totalAmount: fixPrecision(totalAmount),
            averagePrice: fixPrecision(averagePrice),
            removeStockAdjustment: fixPrecision(newRemoveAdj),
            status,
            updatedAt: new Date(),
          },
        },
      );
    }
  } catch (err) {
    console.error("❌ removeSaleDeductionsFromStock failed:", err.message);
  }
};

// Helper: Flatten nested objects for Excel export
const flattenObject = (obj, parentKey = "", result = {}) => {
  if (!obj || typeof obj !== "object") return result;
  for (let [key, value] of Object.entries(obj)) {
    const newKey = parentKey ? `${parentKey}.${key}` : key;
    if (
      value &&
      typeof value === "object" &&
      !(value instanceof Date) &&
      !Array.isArray(value)
    ) {
      flattenObject(value, newKey, result);
    } else if (Array.isArray(value)) {
      result[newKey] = JSON.stringify(value);
    } else {
      result[newKey] =
        value instanceof Date
          ? formatDateTime(value)
          : value == null
            ? ""
            : String(value);
    }
  }
  return result;
};

// ─── GET /users/list ─────────────────────────────────────────────────────────
router.get("/users/list", async (req, res) => {
  try {
    const [staff, users] = await Promise.all([
      Staff.find({ isActive: true }).select("_id medicalRepName tMRId"),
      User.find({ isActive: true }).select("_id name role"),
    ]);

    const staffList = staff.map((s) => ({
      value: s._id.toString(),
      label: `${s.medicalRepName} (${s.tMRId || "N/A"})`,
      type: "staff",
    }));
    const userList = users.map((u) => ({
      value: u._id.toString(),
      label: `${u.name} (${u.role})`,
      type: "user",
    }));

    const combined = [...staffList, ...userList];
    res.json({ success: true, count: combined.length, data: combined });
  } catch (err) {
    console.error("User list error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET / ───────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      action,
      tableName,
      userId,
      startDate,
      endDate,
      search,
      referenceNumber,
      activityType = "all",
    } = req.query;

    const filter = {};

    if (action) filter.action = action;
    if (tableName) filter.tableName = tableName;
    if (userId && userId !== "undefined" && userId !== "null" && userId !== "")
      filter.userId = userId;
    if (referenceNumber)
      filter.referenceNumber = { $regex: referenceNumber, $options: "i" };
    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: "i" } },
        { actionLabel: { $regex: search, $options: "i" } },
        { referenceNumber: { $regex: search, $options: "i" } },
        { tableName: { $regex: search, $options: "i" } },
        { tableLabel: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (activityType === "normal") {
      filter.action = { $in: ["DELETE", "UPDATE", "CREATE", "IMPORT"] };
      filter.isReverted = { $ne: true };
    } else if (activityType === "revert") {
      filter.action = "REVERT";
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      logs: logs.map((l) => ({
        ...l,
        formattedDate: formatDateTime(l.createdAt),
      })),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    console.error("Fetch logs error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /:id/details ────────────────────────────────────────────────────────
router.get("/:id/details", async (req, res) => {
  try {
    const log = await ActivityLog.findById(req.params.id).lean();
    if (!log)
      return res.status(404).json({ success: false, message: "Log not found" });

    let liveRecord = null;
    if (log.recordId && log.tableName) {
      try {
        const importer = TABLE_MODEL_MAP[log.tableName];
        if (importer) {
          const mod = await importer();
          const Model = mod.default;
          if (mongoose.Types.ObjectId.isValid(log.recordId)) {
            liveRecord = await Model.findById(log.recordId).lean();
          }
        }
      } catch (e) {
        console.error("Live record fetch error:", e.message);
      }
    }

    res.json({
      success: true,
      log: { ...log, formattedDate: formatDateTime(log.createdAt) },
      liveRecord,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /stats/summary ──────────────────────────────────────────────────────
router.get("/stats/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    const [byAction, byTable, byUser, total] = await Promise.all([
      ActivityLog.aggregate([
        { $match: filter },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ActivityLog.aggregate([
        { $match: filter },
        { $group: { _id: "$tableName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ActivityLog.aggregate([
        { $match: filter },
        { $group: { _id: "$userName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      ActivityLog.countDocuments(filter),
    ]);
    res.json({ success: true, total, byAction, byTable, byUser });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/revert - FIXED for stock adjustments
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/revert", protect, async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== "super admin" && role !== "super" && role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only super-admin can revert actions.",
      });
    }

    const log = await ActivityLog.findById(req.params.id).lean();
    if (!log)
      return res.status(404).json({ success: false, message: "Log not found" });
    if (log.isReverted)
      return res
        .status(400)
        .json({ success: false, message: "Already reverted." });
    if (!["DELETE", "UPDATE", "CREATE", "IMPORT"].includes(log.action)) {
      return res.status(400).json({
        success: false,
        message: `Cannot revert action: ${log.action}`,
      });
    }

    const importer = TABLE_MODEL_MAP[log.tableName];
    if (!importer) {
      return res.status(400).json({
        success: false,
        message: `No model found for table: ${log.tableName}`,
      });
    }
    const mod = await importer();
    const Model = mod.default;

    let revertSummary = {};

    // ── DELETE revert: restore deleted records ────────────────────────────────
    if (log.action === "DELETE") {
      const rows = log.previousSnapshots?.length
        ? log.previousSnapshots
        : log.previousData
          ? (Array.isArray(log.previousData)
              ? log.previousData
              : [log.previousData]
            ).map((d) => ({ data: d }))
          : [];

      if (!rows.length) {
        return res.status(400).json({
          success: false,
          message: "No snapshot data available to restore.",
        });
      }

      let restored = 0,
        failed = 0;
      const restoredDocs = [];

      for (const row of rows) {
        const docData = row.data || row;
        const { _id, __v, createdAt, updatedAt, ...rest } = docData;
        try {
          const existing = await Model.findById(_id);
          if (existing) {
            failed++;
            continue;
          }
          const doc = new Model({
            _id: new mongoose.Types.ObjectId(String(_id)),
            ...rest,
          });
          await doc.save();
          restoredDocs.push(docData);
          restored++;
        } catch (e) {
          console.error("Restore failed for", _id, e.message);
          failed++;
        }
      }

      if (restoredDocs.length > 0) {
        if (log.tableName === "purchase") {
          for (const doc of restoredDocs)
            await restorePurchaseInvoiceBatchesToStock(doc);
        } else if (log.tableName === "sales") {
          for (const doc of restoredDocs)
            await removeSaleDeductionsFromStock(doc);
        } else if (
          log.tableName === "StockAdjustment" ||
          log.tableName === "stockadjustments"
        ) {
          // When restoring a deleted adjustment, we need to RE-APPLY its effect
          // Because the adjustment was deleted, its effect was removed from stock
          for (const doc of restoredDocs) {
            await applyStockAdjustmentToReport(doc, false);
          }
        }
        await recalculateAllReportInHandTotals();
      }

      revertSummary = { restored, failed };

      // ── UPDATE revert: roll back fields to previous state ────────────────────
    } else if (log.action === "UPDATE") {
      const prevDoc = log.previousSnapshots?.[0]?.data || log.previousData;
      if (!prevDoc) {
        return res.status(400).json({
          success: false,
          message: "No previous snapshot to roll back to.",
        });
      }
      const targetId =
        log.recordId || (prevDoc._id ? String(prevDoc._id) : null);
      if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
        return res.status(400).json({
          success: false,
          message: "Cannot revert: invalid recordId.",
        });
      }

      // For stock adjustment UPDATE revert
      if (
        log.tableName === "StockAdjustment" ||
        log.tableName === "stockadjustments"
      ) {
        const newDoc = log.newSnapshots?.[0]?.data || log.newData;
        if (newDoc && prevDoc) {
          // First, revert the effect of the NEW adjustment (undo what it did)
          await applyStockAdjustmentToReport(newDoc, true);
          // Then, apply the effect of the OLD adjustment (re-apply the original)
          await applyStockAdjustmentToReport(prevDoc, false);
        }
      }

      // For sales UPDATE revert
      if (log.tableName === "sales") {
        const newDoc = log.newSnapshots?.[0]?.data || log.newData;
        if (newDoc) {
          await restoreSaleDeductionsToStock(newDoc);
          await removeSaleDeductionsFromStock(prevDoc);
        }
      } else if (log.tableName === "purchase") {
        const newDoc = log.newSnapshots?.[0]?.data || log.newData;
        if (newDoc) {
          await removePurchaseInvoiceBatchesFromStock(newDoc);
          await restorePurchaseInvoiceBatchesToStock(prevDoc);
        }
      }

      const { _id, __v, createdAt, updatedAt, ...prevFields } = prevDoc;
      const updated = await Model.findByIdAndUpdate(
        targetId,
        { $set: prevFields },
        { new: true, runValidators: false },
      );

      if (
        updated &&
        (log.tableName === "purchase" ||
          log.tableName === "sales" ||
          log.tableName === "StockAdjustment" ||
          log.tableName === "stockadjustments")
      ) {
        await recalculateAllReportInHandTotals();
      }

      revertSummary = { rolledBack: updated ? 1 : 0 };

      // ── CREATE revert: delete the created record ─────────────────────────────
    } else if (log.action === "CREATE") {
      const newDoc = log.newSnapshots?.[0]?.data || log.newData;
      if (!newDoc) {
        return res.status(400).json({
          success: false,
          message: "No snapshot data available for the created record.",
        });
      }
      const targetId = log.recordId || (newDoc._id ? String(newDoc._id) : null);
      if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
        return res.status(400).json({
          success: false,
          message: "Cannot revert: invalid recordId.",
        });
      }

      const existingRecord = await Model.findById(targetId);
      if (!existingRecord) {
        return res.status(400).json({
          success: false,
          message: "Record no longer exists in the database.",
        });
      }

      if (log.tableName === "purchase") {
        await removePurchaseInvoiceBatchesFromStock(newDoc);
      } else if (log.tableName === "sales") {
        await restoreSaleDeductionsToStock(newDoc);
      } else if (
        log.tableName === "StockAdjustment" ||
        log.tableName === "stockadjustments"
      ) {
        // When deleting a created adjustment, we need to REVERSE its effect
        await applyStockAdjustmentToReport(newDoc, true);
      }

      await Model.findByIdAndDelete(targetId);

      if (
        log.tableName === "purchase" ||
        log.tableName === "sales" ||
        log.tableName === "StockAdjustment" ||
        log.tableName === "stockadjustments"
      ) {
        await recalculateAllReportInHandTotals();
      }

      revertSummary = { deleted: 1 };

      // ── IMPORT revert: delete ALL imported records ───────────────────────────
    } else if (log.action === "IMPORT") {
      const importedRows = log.newSnapshots?.length
        ? log.newSnapshots
        : Array.isArray(log.newData)
          ? log.newData.map((d) => ({ data: d }))
          : log.newData
            ? [{ data: log.newData }]
            : [];

      let invoiceDocuments = [];

      if (importedRows.length > 0) {
        for (const row of importedRows) {
          const docData = row.data || row;
          if (
            docData.invoices &&
            Array.isArray(docData.invoices) &&
            docData.invoices.length > 0
          ) {
            for (const inv of docData.invoices) {
              if (inv.invoiceNumber) {
                try {
                  const fullDoc = await Model.findOne({
                    invoiceNumber: inv.invoiceNumber,
                  }).lean();
                  if (fullDoc) invoiceDocuments.push(fullDoc);
                } catch (e) {
                  console.error(
                    `Failed to fetch invoice ${inv.invoiceNumber}:`,
                    e.message,
                  );
                }
              }
            }
          } else if (docData._id) {
            invoiceDocuments.push(docData);
          }
        }
      }

      if (!invoiceDocuments.length) {
        return res.status(400).json({
          success: false,
          message:
            "No imported records found to revert. The snapshot may not contain full invoice data.",
        });
      }

      let deletedCount = 0;
      let failedCount = 0;

      for (const docData of invoiceDocuments) {
        const recordId = docData._id;
        if (!recordId) {
          failedCount++;
          continue;
        }
        try {
          const existing = await Model.findById(recordId);
          if (existing) {
            if (log.tableName === "purchase") {
              await removePurchaseInvoiceBatchesFromStock(
                existing.toObject ? existing.toObject() : existing,
              );
            } else if (log.tableName === "sales") {
              await restoreSaleDeductionsToStock(
                existing.toObject ? existing.toObject() : existing,
              );
            } else if (
              log.tableName === "StockAdjustment" ||
              log.tableName === "stockadjustments"
            ) {
              // For each imported adjustment, reverse its effect
              await applyStockAdjustmentToReport(
                existing.toObject ? existing.toObject() : existing,
                true,
              );
            }
            await Model.findByIdAndDelete(recordId);
            deletedCount++;
          } else {
            console.warn(
              `⚠️ Imported record ${recordId} not found in DB — already deleted?`,
            );
            failedCount++;
          }
        } catch (e) {
          console.error(
            `❌ Failed to delete imported record ${recordId}:`,
            e.message,
          );
          failedCount++;
        }
      }

      if (
        deletedCount > 0 &&
        (log.tableName === "purchase" ||
          log.tableName === "sales" ||
          log.tableName === "StockAdjustment" ||
          log.tableName === "stockadjustments")
      ) {
        await recalculateAllReportInHandTotals();
      }

      revertSummary = { deleted: deletedCount, failed: failedCount };
    }

    // ── Write the REVERT activity log entry ───────────────────────────────────
    const revertLog = await ActivityLog.create({
      userId: req.user._id || req.user.id,
      userName: req.user.name || req.user.userName || "Super Admin",
      userRole: req.user.role,
      userEmail: req.user.email || null,
      action: "REVERT",
      actionLabel: `Reverted: ${log.actionLabel || log.action + " on " + (log.tableLabel || log.tableName)}`,
      tableName: log.tableName,
      tableLabel: log.tableLabel,
      recordId: log.recordId,
      referenceNumber: log.referenceNumber,
      previousSnapshots: log.newSnapshots,
      newSnapshots: log.previousSnapshots,
      previousData: log.newData,
      newData: log.previousData,
      ipAddress:
        req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || null,
      userAgent: req.headers["user-agent"] || null,
      description: `Reverted ${log.action} action. Original log ID: ${log._id}. Stock recalculated. Summary: ${JSON.stringify(revertSummary)}`,
    });

    await ActivityLog.findByIdAndUpdate(log._id, {
      isReverted: true,
      revertedAt: new Date(),
      revertedBy: req.user.name || req.user.userName || "Super Admin",
      revertLogId: revertLog._id.toString(),
    });

    res.json({
      success: true,
      message: "Reverted successfully. Stock totals have been recalculated.",
      revertSummary,
      revertLogId: revertLog._id,
    });
  } catch (err) {
    console.error("Revert error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /:id/revert-single ─────────────────────────────────────────────────
router.post("/:id/revert-single", protect, async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== "super admin" && role !== "super" && role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only super-admin can revert actions.",
      });
    }

    const { recordId, recordIndex } = req.body;
    const log = await ActivityLog.findById(req.params.id).lean();

    if (!log)
      return res.status(404).json({ success: false, message: "Log not found" });
    if (log.isReverted)
      return res
        .status(400)
        .json({ success: false, message: "Already reverted." });
    if (log.action !== "DELETE") {
      return res.status(400).json({
        success: false,
        message: "Single record revert only available for DELETE actions",
      });
    }

    const rows = log.previousSnapshots?.length
      ? log.previousSnapshots
      : Array.isArray(log.previousData)
        ? log.previousData.map((d) => ({ data: d }))
        : log.previousData
          ? [{ data: log.previousData }]
          : [];

    if (!rows.length || recordIndex >= rows.length) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid record index" });
    }

    const targetRow = rows[recordIndex];
    const docData = targetRow.data || targetRow;

    const importer = TABLE_MODEL_MAP[log.tableName];
    if (!importer) {
      return res.status(400).json({
        success: false,
        message: `No model found for table: ${log.tableName}`,
      });
    }

    const mod = await importer();
    const Model = mod.default;

    const { _id, __v, createdAt, updatedAt, ...rest } = docData;

    try {
      const existing = await Model.findById(_id);
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Record already exists in the database",
        });
      }

      const doc = new Model({
        _id: new mongoose.Types.ObjectId(String(_id)),
        ...rest,
      });
      await doc.save();

      if (log.tableName === "purchase") {
        await restorePurchaseInvoiceBatchesToStock(docData);
      } else if (log.tableName === "sales") {
        await removeSaleDeductionsFromStock(docData);
      } else if (
        log.tableName === "StockAdjustment" ||
        log.tableName === "stockadjustments"
      ) {
        // When restoring a single deleted adjustment, apply its effect
        await applyStockAdjustmentToReport(docData, false);
      }

      if (
        log.tableName === "purchase" ||
        log.tableName === "sales" ||
        log.tableName === "StockAdjustment" ||
        log.tableName === "stockadjustments"
      ) {
        await recalculateAllReportInHandTotals();
      }

      await ActivityLog.create({
        userId: req.user._id || req.user.id,
        userName: req.user.name || req.user.userName || "Super Admin",
        userRole: req.user.role,
        userEmail: req.user.email || null,
        action: "REVERT",
        actionLabel: `Reverted single record from ${log.actionLabel || log.action + " on " + (log.tableLabel || log.tableName)}`,
        tableName: log.tableName,
        tableLabel: log.tableLabel,
        referenceNumber: targetRow.refNumber,
        previousData: null,
        newData: docData,
        ipAddress:
          req.ip ||
          req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
          null,
        userAgent: req.headers["user-agent"] || null,
        description: `Reverted single record from DELETE action. Original log ID: ${log._id}, Record Index: ${recordIndex}. Stock recalculated.`,
      });

      res.json({
        success: true,
        message:
          "Record restored successfully. Stock totals have been recalculated.",
      });
    } catch (e) {
      console.error("Single record restore failed:", e.message);
      res.status(500).json({ success: false, message: e.message });
    }
  } catch (err) {
    console.error("Revert single error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /export ─────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const {
      action,
      tableName,
      userId,
      startDate,
      endDate,
      search,
      activityType = "all",
    } = req.query;

    const filter = {};

    if (action) filter.action = action;
    if (tableName) filter.tableName = tableName;
    if (userId && userId !== "undefined" && userId !== "null" && userId !== "")
      filter.userId = userId;
    if (search) {
      filter.$or = [
        { userName: { $regex: search, $options: "i" } },
        { actionLabel: { $regex: search, $options: "i" } },
        { tableName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (activityType === "normal") {
      filter.action = { $in: ["DELETE", "UPDATE", "CREATE", "IMPORT"] };
      filter.isReverted = { $ne: true };
    } else if (activityType === "revert") {
      filter.action = "REVERT";
    }

    const logs = await ActivityLog.find(filter).sort({ createdAt: -1 }).lean();

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const sheetData = [];
    sheetData.push([]);
    sheetData.push(["HEALTHCARE SOUTH EAST ASIA"]);
    sheetData.push(["User Activity Logs"]);
    sheetData.push([`Generated On: ${formattedDate}`]);
    sheetData.push([]);

    if (startDate || endDate) {
      let dateRange = "";
      if (startDate && endDate) {
        dateRange = `Date Range: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
      } else if (startDate) {
        dateRange = `From: ${new Date(startDate).toLocaleDateString()}`;
      } else if (endDate) {
        dateRange = `Until: ${new Date(endDate).toLocaleDateString()}`;
      }
      if (dateRange) {
        sheetData.push([dateRange]);
        sheetData.push([]);
      }
    }

    sheetData.push([
      "Date & Time",
      "User",
      "Role",
      "Action",
      "Details",
      "Status",
      "Reverted By",
      "Reverted At",
      "Expires At",
    ]);

    logs.forEach((l) => {
      sheetData.push([
        formatDateTime(l.createdAt),
        l.userName || "System",
        l.userRole || "",
        l.action || "",
        l.actionLabel || l.description || "",
        l.isReverted ? "Reverted" : "Normal",
        l.revertedBy || "",
        l.revertedAt ? formatDateTime(l.revertedAt) : "",
        l.expiresAt ? formatDateTime(l.expiresAt) : "",
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = [
      { wch: 22 },
      { wch: 18 },
      { wch: 12 },
      { wch: 10 },
      { wch: 50 },
      { wch: 10 },
      { wch: 18 },
      { wch: 22 },
      { wch: 22 },
    ];

    const headerRowIndex = sheetData.findIndex(
      (row) => row[0] === "Date & Time" && row[1] === "User",
    );
    const lastColumnIndex = 8;
    const companyRowIndex = 1;
    const titleRowIndex = 2;
    const dateRowIndex = 3;

    for (let c = 0; c <= lastColumnIndex; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: companyRowIndex, c });
      if (!ws[cellAddress])
        ws[cellAddress] = { t: "s", v: "HEALTHCARE SOUTH EAST ASIA" };
      ws[cellAddress].s = {
        font: { bold: true, sz: 18, color: { rgb: "1E3A8A" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }

    for (let c = 0; c <= lastColumnIndex; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: titleRowIndex, c });
      if (!ws[cellAddress])
        ws[cellAddress] = { t: "s", v: "User Activity Logs" };
      ws[cellAddress].s = {
        font: { bold: true, sz: 14, color: { rgb: "1E40AF" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }

    for (let c = 0; c <= lastColumnIndex; c++) {
      const cellAddress = XLSX.utils.encode_cell({ r: dateRowIndex, c });
      if (ws[cellAddress]) {
        ws[cellAddress].s = {
          font: { italic: true, color: { rgb: "6B7280" } },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    }

    if (!ws["!merges"]) ws["!merges"] = [];
    ws["!merges"].push(
      {
        s: { r: companyRowIndex, c: 0 },
        e: { r: companyRowIndex, c: lastColumnIndex },
      },
      {
        s: { r: titleRowIndex, c: 0 },
        e: { r: titleRowIndex, c: lastColumnIndex },
      },
      {
        s: { r: dateRowIndex, c: 0 },
        e: { r: dateRowIndex, c: lastColumnIndex },
      },
    );

    const filterRowIndex = sheetData.findIndex(
      (row) => row && row[0] && row[0].startsWith("Date Range:"),
    );
    if (filterRowIndex >= 0) {
      for (let i = 0; i <= lastColumnIndex; i++) {
        const cellAddress = XLSX.utils.encode_cell({ r: filterRowIndex, c: i });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            font: { color: { rgb: "DC2626" } },
            alignment: { horizontal: "center", vertical: "center" },
          };
        }
      }
      ws["!merges"].push({
        s: { r: filterRowIndex, c: 0 },
        e: { r: filterRowIndex, c: lastColumnIndex },
      });
    }

    if (headerRowIndex >= 0) {
      for (let i = 0; i <= lastColumnIndex; i++) {
        const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: i });
        if (!ws[cellAddress]) ws[cellAddress] = {};
        ws[cellAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "4F46E5" }, patternType: "solid" },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    }

    const dataStartRow = headerRowIndex + 1;
    for (let i = dataStartRow; i < sheetData.length; i++) {
      const rowColor = (i - dataStartRow) % 2 === 0 ? "F9FAFB" : "FFFFFF";
      for (let c = 0; c <= lastColumnIndex; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r: i, c });
        if (ws[cellAddress]) {
          if (!ws[cellAddress].s) ws[cellAddress].s = {};
          ws[cellAddress].s.fill = {
            fgColor: { rgb: rowColor },
            patternType: "solid",
          };
          ws[cellAddress].s.alignment = { vertical: "center" };
        }
      }
    }

    for (let r = 0; r < sheetData.length; r++) {
      for (let c = 0; c <= lastColumnIndex; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        if (ws[cellAddress]) {
          if (!ws[cellAddress].s) ws[cellAddress].s = {};
          ws[cellAddress].s.border = {
            top: { style: "thin", color: { rgb: "E5E7EB" } },
            bottom: { style: "thin", color: { rgb: "E5E7EB" } },
            left: { style: "thin", color: { rgb: "E5E7EB" } },
            right: { style: "thin", color: { rgb: "E5E7EB" } },
          };
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "User Activity Logs");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=user_activity_logs.xlsx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ success: false, message: "Failed to export logs" });
  }
});

// ─── DELETE /cleanup/:days ───────────────────────────────────────────────────
router.delete("/cleanup/:days", protect, async (req, res) => {
  try {
    if (
      req.user?.role !== "super admin" &&
      req.user?.role !== "super" &&
      req.user?.role !== "superadmin"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Super-admin only." });
    }
    const days = parseInt(req.params.days) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result = await ActivityLog.deleteMany({ createdAt: { $lt: cutoff } });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
