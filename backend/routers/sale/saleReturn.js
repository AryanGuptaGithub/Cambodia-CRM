import express from "express";
import mongoose from "mongoose";
import SalesReturn from "../../models/sale/saleReturn.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import ExcelJS from "exceljs";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";
import { emitEvent, EVENT_TYPES, captureSnapshotBefore } from "../../observability/auditLogger.js";

const router = express.Router();

const formatDateToReadable = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// ================== Helper Functions ==================

/**
 * ADD: Push a return batch into ReportInHand when a sale return is created.
 *
 * IMPORTANT: This must be called AFTER insertMany so we have the REAL
 * savedReturn._id to store in the batch. The schema's pre-save hook sums all
 * batches to compute totalBoxes/totalAmount automatically.
 */
const addReturnBatchToStock = async (
  productName,
  returnQuantity,
  invoiceNumber,
  saleReturnId, // must be the real saved SalesReturn._id
  lc,
) => {
  try {
    let reportInHand = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    });

    if (!reportInHand) {
      reportInHand = new ReportInHand({
        productName: productName.toLowerCase(),
        batches: [],
        pendingReturns: [],
      });
    }

    const returnLc = lc || reportInHand.averagePrice || 0;
    const returnAmount = returnQuantity * returnLc;

    reportInHand.batches.push({
      boxes: returnQuantity,
      lc: returnLc,
      amount: returnAmount,
      adjustmentType: "return",
      date: new Date(),
      saleReturnId: saleReturnId, // ← real _id stored here for later lookup
      invoiceNumber: invoiceNumber,
    });

    reportInHand.pendingReturns.push({
      saleReturnId: saleReturnId,
      invoiceNumber: invoiceNumber,
      quantity: returnQuantity,
      originalLc: returnLc,
      status: "pending",
      returnDate: new Date(),
    });

    await reportInHand.save();

    console.log(
      `✅ Added return batch for "${productName}": ${returnQuantity} boxes ` +
        `at LC ${returnLc}, saleReturnId=${saleReturnId}, ` +
        `totalBoxes=${reportInHand.totalBoxes}, totalAmount=${reportInHand.totalAmount}`,
    );

    return { success: true, reportInHand };
  } catch (error) {
    console.error(
      `❌ addReturnBatchToStock failed for "${productName}":`,
      error,
    );
    return { success: false, error: error.message };
  }
};

/**
 * REMOVE: Delete the return batch from ReportInHand when a sale return is deleted.
 *
 * ROOT CAUSE FIX:
 * The original POST code created a `tempSaleReturnId = new mongoose.Types.ObjectId()`
 * BEFORE calling insertMany, so the saleReturnId stored in the batch was a random
 * temp ID — NOT the actual SalesReturn._id. When DELETE ran, it tried to match
 * by the real record._id, which never matched the temp ID → batch never removed
 * → totalBoxes/totalAmount stayed at 9939/11926.8 instead of reverting to 9899/11878.8.
 *
 * Fix: POST now calls addReturnBatchToStock AFTER insertMany with the real _id.
 * This function tries an exact match first, then falls back to invoiceNumber-only
 * to handle any batches created with the old broken code.
 */
const removeReturnBatchFromStock = async (
  productName,
  returnQuantity,
  invoiceNumber,
  saleReturnId, // the real SalesReturn._id
  lc,
) => {
  try {
    const reportInHand = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    });

    if (!reportInHand) {
      console.log(`⚠️ ReportInHand not found for "${productName}" — skipping`);
      return { success: false, error: "Product not found in inventory" };
    }

    // Step 1: Exact match by saleReturnId + invoiceNumber
    let returnBatchIndex = reportInHand.batches.findIndex(
      (batch) =>
        batch.adjustmentType === "return" &&
        batch.invoiceNumber === invoiceNumber &&
        batch.saleReturnId?.toString() === saleReturnId?.toString(),
    );

    // Step 2: Fallback — match by invoiceNumber + adjustmentType only
    // Handles batches created with old broken temp-ID code
    if (returnBatchIndex === -1) {
      console.log(
        `⚠️ Exact saleReturnId match failed for "${productName}", ` +
          `trying invoiceNumber-only fallback...`,
      );
      returnBatchIndex = reportInHand.batches.findIndex(
        (batch) =>
          batch.adjustmentType === "return" &&
          batch.invoiceNumber === invoiceNumber,
      );
    }

    if (returnBatchIndex === -1) {
      console.log(
        `⚠️ No return batch found for "${productName}", invoice "${invoiceNumber}"`,
      );
      return { success: false, error: "Return batch not found" };
    }

    const removedBatch = reportInHand.batches[returnBatchIndex];
    console.log(
      `🗑️ Removing return batch for "${productName}": ` +
        `${removedBatch.boxes} boxes, amount=${removedBatch.amount}`,
    );

    // Remove the return batch entirely
    reportInHand.batches.splice(returnBatchIndex, 1);

    // Remove from pendingReturns
    const pendingIndex = reportInHand.pendingReturns.findIndex(
      (pr) =>
        pr.invoiceNumber === invoiceNumber ||
        pr.saleReturnId?.toString() === saleReturnId?.toString(),
    );
    if (pendingIndex !== -1) {
      reportInHand.pendingReturns.splice(pendingIndex, 1);
    }

    await reportInHand.save();

    console.log(
      `✅ Return batch removed for "${productName}": ` +
        `totalBoxes=${reportInHand.totalBoxes}, totalAmount=${reportInHand.totalAmount}`,
    );

    return { success: true, reportInHand };
  } catch (error) {
    console.error(
      `❌ removeReturnBatchFromStock failed for "${productName}":`,
      error,
    );
    return { success: false, error: error.message };
  }
};

/**
 * ADJUST: Handle quantity difference when a sale return is updated (PUT /:id).
 */
const updateStockQuantityDifference = async (
  productName,
  oldQuantity,
  newQuantity,
  invoiceNumber,
  saleReturnId,
  lc,
) => {
  const diff = newQuantity - oldQuantity;
  if (diff === 0) return { success: true };

  if (diff > 0) {
    console.log(
      `📦 Return increase for "${productName}": +${diff} boxes (${oldQuantity} → ${newQuantity})`,
    );
    return await addReturnBatchToStock(
      productName,
      diff,
      invoiceNumber,
      saleReturnId,
      lc,
    );
  }

  // diff < 0 — shrink or remove the existing return batch
  const removeQty = Math.abs(diff);
  console.log(
    `📦 Return decrease for "${productName}": -${removeQty} boxes (${oldQuantity} → ${newQuantity})`,
  );

  const reportInHand = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, "i") },
  });

  if (!reportInHand) return { success: true };

  // Exact match first, then fallback
  let returnBatchIndex = reportInHand.batches.findIndex(
    (batch) =>
      batch.adjustmentType === "return" &&
      batch.invoiceNumber === invoiceNumber &&
      batch.saleReturnId?.toString() === saleReturnId?.toString(),
  );

  if (returnBatchIndex === -1) {
    returnBatchIndex = reportInHand.batches.findIndex(
      (batch) =>
        batch.adjustmentType === "return" &&
        batch.invoiceNumber === invoiceNumber,
    );
  }

  if (returnBatchIndex === -1) {
    console.log(`⚠️ Return batch not found for "${productName}" during update`);
    return { success: true };
  }

  const currentBatch = reportInHand.batches[returnBatchIndex];
  const newBatchQty = currentBatch.boxes - removeQty;

  if (newBatchQty <= 0) {
    reportInHand.batches.splice(returnBatchIndex, 1);
    console.log(`✅ Return batch removed entirely for "${productName}"`);
  } else {
    currentBatch.boxes = newBatchQty;
    currentBatch.amount = newBatchQty * currentBatch.lc;
    console.log(
      `✅ Return batch reduced to ${newBatchQty} boxes for "${productName}"`,
    );
  }

  // Update pendingReturns quantity
  const pendingIndex = reportInHand.pendingReturns.findIndex(
    (pr) => pr.invoiceNumber === invoiceNumber,
  );
  if (pendingIndex !== -1) {
    if (newQuantity <= 0) {
      reportInHand.pendingReturns.splice(pendingIndex, 1);
    } else {
      reportInHand.pendingReturns[pendingIndex].quantity = newQuantity;
    }
  }

  await reportInHand.save();
  console.log(
    `📊 Stock adjusted for "${productName}": ` +
      `totalBoxes=${reportInHand.totalBoxes}, totalAmount=${reportInHand.totalAmount}`,
  );

  return { success: true };
};

// ================== POST / ==================
router.post("/", protect, async (req, res) => {
  console.log("🚀 [START] POST /sales-return endpoint called");
  const _startMs = Date.now(); // ── NEW ──
    const snapshotBefore = await captureSnapshotBefore();
    console.log('🔴 [saleReturn DEBUG] snapshotBefore captured:', !!snapshotBefore, snapshotBefore?.totalSales);

  try {
    const data = req.body;
    const records = Array.isArray(data) ? data : [data];

    if (records.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Expected a non‑empty array of sales return records",
      });
    }

    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerName",
      "products",
    ];

    const processedData = await Promise.all(
      records.map(async (record, index) => {
        for (const field of requiredFields) {
          if (
            record[field] === undefined ||
            record[field] === null ||
            record[field] === ""
          ) {
            throw new Error(
              `Missing required field "${field}" in record ${index + 1}`,
            );
          }
        }

        if (!Array.isArray(record.products) || record.products.length === 0) {
          throw new Error(
            `Products array is required and cannot be empty in record ${index + 1}`,
          );
        }

        // Customer lookup
        let customerId = null;
        try {
          if (
            record.customerId &&
            mongoose.Types.ObjectId.isValid(record.customerId)
          ) {
            customerId = new mongoose.Types.ObjectId(record.customerId);
          } else {
            const customer = await Customer.findOne({
              name: { $regex: new RegExp(`^${record.customerName}$`, "i") },
            });
            if (customer) customerId = customer._id;
          }
        } catch (customerError) {
          console.error("Customer handling error:", customerError);
        }

        // Map products — do NOT update stock here, wait for real _id after insertMany
        const mappedProducts = record.products.map((p) => {
          const salesQty = Number(p.salesQty) || 0;
          const bonusQty = Number(p.bonusQty) || 0;
          const sellingPrice = Number(p.sellingPrice) || 0;
          const discount = Number(p.discount) || 0;
          const lc = Number(p.lc) || 0;
          const returnQuantity = Math.min(
            Number(p.returnQuantity) || 0,
            salesQty,
          );
          const usedQty = salesQty - returnQuantity;

          const amount = usedQty * sellingPrice;
          const netSellingAmount = amount - discount;
          const totalQty = usedQty + bonusQty;
          const usedAmount = usedQty * sellingPrice;
          const averageUnitPrice =
            totalQty > 0 ? netSellingAmount / totalQty : 0;
          const profitLoss = netSellingAmount - usedQty * lc;

          return {
            productName: p.productName || "",
            salesQty,
            bonusQty,
            sellingPrice,
            discount,
            lc,
            returnQuantity,
            usedQty,
            usedPrice: sellingPrice,
            usedAmount,
            totalQty,
            amount,
            netSellingAmount,
            averageUnitPrice,
            profitLoss,
            isProductAccept: false,
          };
        });

        const totalAmount = mappedProducts.reduce(
          (sum, p) => sum + p.netSellingAmount,
          0,
        );
        const paidAmount = parseFloat(record.paidAmount) || 0;
        const dueAmount = Math.max(0, totalAmount - paidAmount);
        const creditDays = parseInt(record.creditDays) || 0;

        let dueDate = null;
        if (record.invoiceDate && creditDays > 0) {
          const invoiceDateObj = new Date(record.invoiceDate);
          dueDate = new Date(
            invoiceDateObj.setDate(invoiceDateObj.getDate() + creditDays),
          );
        }

        return {
          recordingDate: record.recordingDate,
          invoiceNumber: record.invoiceNumber,
          invoiceDate: record.invoiceDate,
          mrName: record.mrName,
          customerName: record.customerName,
          customerId,
          products: mappedProducts,
          creditDays,
          dueDate,
          deliveryDate: record.deliveryDate || record.invoiceDate,
          paidAmount,
          dueAmount,
          totalAmount,
          paymentStatus: record.paymentStatus || "Credit",
          remark: record.remark || "",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
    );

    // ── Save first to get real _id values ────────────────────────────────────
    const savedReturns = await SalesReturn.insertMany(processedData);
    console.log(`✅ ${savedReturns.length} sales return records saved`);
    console.log(`   IDs: ${savedReturns.map((r) => r._id).join(", ")}`);

    // ── Update ReportInHand with REAL savedReturn._id ─────────────────────────
    // This ensures removeReturnBatchFromStock can find the batch by exact match
    // when the sale return is later deleted.
    for (let i = 0; i < savedReturns.length; i++) {
      const savedReturn = savedReturns[i];
      const record = processedData[i];

      for (const product of record.products) {
        if (product.returnQuantity > 0) {
          console.log(
            `🔄 Updating ReportInHand for "${product.productName}": ` +
              `${product.returnQuantity} boxes, saleReturnId=${savedReturn._id}`,
          );
          const result = await addReturnBatchToStock(
            product.productName,
            product.returnQuantity,
            record.invoiceNumber,
            savedReturn._id, // ← REAL _id, NOT a temp ObjectId
            product.lc,
          );
          if (!result.success) {
            console.log(
              `⚠️ ReportInHand update failed for "${product.productName}": ${result.error}`,
            );
          }
        }
      }
    }

    // Update SaleSummary
    try {
      const updatePromises = processedData.flatMap((record) =>
        record.products.map((product) =>
          SaleSummary.updateMany(
            {
              invoiceNumber: record.invoiceNumber,
              "products.productName": product.productName,
            },
            {
              $set: {
                "products.$.isProductAccept": false,
                "products.$.returnQuantity": product.returnQuantity,
                "products.$.usedQty": product.usedQty,
                "products.$.usedAmount": product.usedAmount,
                "products.$.profitLoss": product.profitLoss,
              },
            },
          ),
        ),
      );
      await Promise.all(updatePromises);
      console.log(`✅ Sale summaries updated`);
    } catch (updateError) {
      console.error(`⚠️ Error updating sale summaries:`, updateError.message);
    }

    // Log activities
    for (const savedReturn of savedReturns) {
      await logActivity(req, {
        action: "CREATE",
        actionLabel: `Created Sales Return: ${savedReturn.invoiceNumber}`,
        tableName: "salesreturns",
        tableLabel: "Sales Return",
        recordId: savedReturn._id,
        referenceNumber: savedReturn.invoiceNumber,
        newData: {
          invoiceNumber: savedReturn.invoiceNumber,
          customerName: savedReturn.customerName,
          totalAmount: savedReturn.totalAmount,
        },
        description: `Sales return created for invoice ${savedReturn.invoiceNumber}`,
      });
    }

    // ── NEW ──
    await emitEvent(req, {
      eventType:  EVENT_TYPES.SALE_RETURN_CREATED,
      entityType: "SalesReturn",
      entityId:   savedReturns[0]?._id?.toString(),
      status:     "SUCCESS",
      durationMs: Date.now() - _startMs,
      changes: savedReturns.flatMap(r =>
        r.products
          .filter(p => p.returnQuantity > 0)
          .map(p => ({
            module: "ReportInHand",
            action: "RETURN_STOCK_ADDED_BACK",
            field:  p.productName,
            before: 0,
            after:  p.returnQuantity,
            status: "SUCCESS",
             
          }))
      ),
      metadata: {
        count:         savedReturns.length,
        invoiceNos:    savedReturns.map(r => r.invoiceNumber),
        totalAmounts:  savedReturns.map(r => r.totalAmount),
        customerName:  savedReturns[0]?.customerName,
        mrName:        savedReturns[0]?.mrName,
        saleType:      savedReturns[0]?.saleType,
        totalReturnAmount: savedReturns.reduce((s, r) => s + (r.totalAmount || 0), 0),
        snapshotBefore,
        
        products: savedReturns.flatMap(r =>
          r.products
            .filter(p => p.returnQuantity > 0)
            .map(p => ({
              productName:   p.productName,
              returnQty:     p.returnQuantity,
              returnAmount:  p.returnAmount || (p.returnQuantity * (p.sellingPrice || 0)),
              invoiceNo:     r.invoiceNumber,
            }))
        ),
      },
    });
    // ─────────

    return res.status(201).json({
      success: true,
      message: `${savedReturns.length} sales return record(s) saved successfully`,
      data: savedReturns,
    });
  } catch (error) {
    console.error(`❌ Error saving sales returns:`, error);
    // ── NEW ──
    await emitEvent(req, {
      eventType:    EVENT_TYPES.SALE_RETURN_CREATED,
      status:       "FAILED",
      durationMs:   Date.now() - _startMs,
      errorMessage: error.message,
    });
    // ─────────
    return res.status(500).json({
      success: false,
      message: error.message || "Server error while saving sales return",
      error: error.message,
    });
  }
});

// ================== GET / ==================
router.get("/", async (req, res) => {
  try {
    const filters = {};

    if (req.query.invoiceNumber) {
      filters.invoiceNumber = {
        $regex: req.query.invoiceNumber,
        $options: "i",
      };
    }
    if (req.query.customerName) {
      filters.customerName = { $regex: req.query.customerName, $options: "i" };
    }
    if (req.query.mrName) {
      filters.mrName = { $regex: req.query.mrName, $options: "i" };
    }
    if (req.query.paymentStatus) {
      filters.paymentStatus = req.query.paymentStatus;
    }

    const returns = await SalesReturn.find(filters)
      .populate("customerId", "name code")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Sales return records fetched successfully.",
      data: returns,
    });
  } catch (error) {
    console.error("Error fetching sales return records:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// ================== GET /pending-returns/:productName ==================
router.get("/pending-returns/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const reportInHand = await ReportInHand.findOne({ productName });

    if (!reportInHand) {
      return res.status(404).json({
        success: false,
        message: "Product not found in inventory",
      });
    }

    const pendingReturns = reportInHand.getPendingReturnsForDropdown();
    return res.status(200).json({ success: true, data: pendingReturns });
  } catch (error) {
    console.error("Error fetching pending returns:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// ================== POST /process-pending-return ==================
router.post(
  "/process-pending-return",
  protect,
  allowAdminOnly,
  async (req, res) => {
    try {
      const { productName, pendingReturnId } = req.body;

      if (!productName || !pendingReturnId) {
        return res.status(400).json({
          success: false,
          message: "productName and pendingReturnId are required",
        });
      }

      const reportInHand = await ReportInHand.findOne({ productName });

      if (!reportInHand) {
        return res.status(404).json({
          success: false,
          message: "Product not found in inventory",
        });
      }

      await reportInHand.processPendingReturn(pendingReturnId);

      await logActivity(req, {
        action: "UPDATE",
        actionLabel: `Processed Pending Return for ${productName}`,
        tableName: "reportinhands",
        tableLabel: "Report In Hand",
        recordId: reportInHand._id,
        description: `Processed pending return for product ${productName}`,
      });

      return res.status(200).json({
        success: true,
        message: "Pending return processed successfully",
        data: reportInHand,
      });
    } catch (error) {
      console.error("Error processing pending return:", error);
      return res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
);

// ================== GET /:id ==================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sales return ID",
      });
    }

    const saleReturn = await SalesReturn.findById(id).populate(
      "customerId",
      "name code",
    );

    if (!saleReturn) {
      return res.status(404).json({
        success: false,
        message: "Sales return record not found",
      });
    }

    return res.status(200).json({ success: true, data: saleReturn });
  } catch (error) {
    console.error("Error fetching sales return:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// ================== PUT /update-product ==================
router.put("/update-product", protect, allowAdminOnly, async (req, res) => {
  try {
    const { invoiceNumber, productName, salesQty, bonusQty, returnQuantity } =
      req.body;

    if (!invoiceNumber || !productName) {
      return res.status(400).json({
        success: false,
        message: "invoiceNumber and productName are required",
      });
    }

    const saleRecord = await SaleSummary.findOne({ invoiceNumber });

    if (!saleRecord) {
      return res.status(404).json({
        success: false,
        message: "Sale record not found with the provided invoice number",
      });
    }

    const productIndex = saleRecord.products.findIndex(
      (product) => product.productName === productName,
    );

    if (productIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Product not found in the sale record",
      });
    }

    const previousProductData = { ...saleRecord.products[productIndex] };
    const product = saleRecord.products[productIndex];

    const updatedSalesQty =
      salesQty !== undefined ? Number(salesQty) : product.salesQty;
    const updatedBonusQty =
      bonusQty !== undefined ? Number(bonusQty) : product.bonusQty;
    const updatedReturnQuantity =
      returnQuantity !== undefined
        ? Number(returnQuantity)
        : product.returnQuantity;

    const previousReturnQuantity = product.returnQuantity || 0;

    if (updatedReturnQuantity !== previousReturnQuantity) {
      await updateStockQuantityDifference(
        productName,
        previousReturnQuantity,
        updatedReturnQuantity,
        invoiceNumber,
        null,
        product.lc,
      );
    }

    const usedQty = Math.max(0, updatedSalesQty - updatedReturnQuantity);
    const totalQty = usedQty + updatedBonusQty;
    const amount = usedQty * product.sellingPrice;
    const netSellingAmount = amount - product.discount;
    const usedAmount = usedQty * product.sellingPrice;
    const averageUnitPrice = totalQty > 0 ? netSellingAmount / totalQty : 0;
    const profitLoss = netSellingAmount - usedQty * product.lc;

    saleRecord.products[productIndex] = {
      ...product,
      salesQty: updatedSalesQty,
      bonusQty: updatedBonusQty,
      returnQuantity: updatedReturnQuantity,
      usedQty,
      totalQty,
      amount,
      netSellingAmount,
      usedAmount,
      averageUnitPrice,
      profitLoss,
      isProductAccept:
        updatedReturnQuantity > 0 ? false : product.isProductAccept,
    };

    const totalNetSellingAmount = saleRecord.products.reduce(
      (sum, prod) => sum + prod.netSellingAmount,
      0,
    );
    saleRecord.totalAmount = totalNetSellingAmount;
    saleRecord.dueAmount = Math.max(
      0,
      totalNetSellingAmount - saleRecord.paidAmount,
    );

    await saleRecord.save();

    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Product in Sales Return: ${productName}`,
      tableName: "salesreturns",
      tableLabel: "Sales Return",
      recordId: saleRecord._id,
      referenceNumber: invoiceNumber,
      previousData: {
        productName,
        salesQty: previousProductData.salesQty,
        bonusQty: previousProductData.bonusQty,
        returnQuantity: previousProductData.returnQuantity,
      },
      newData: {
        productName,
        salesQty: updatedSalesQty,
        bonusQty: updatedBonusQty,
        returnQuantity: updatedReturnQuantity,
      },
      description: `Updated product ${toTitleCase(productName)} in sales return for invoice ${invoiceNumber}`,
      refField: "invoiceNumber",
    });

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: saleRecord,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// ================== PUT /:id ==================
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const _startMs = Date.now(); // ── NEW ──
  const snapshotBefore = await captureSnapshotBefore();
  try {
    const { id } = req.params;
    const updatedData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sales return ID",
      });
    }

    const previousRecord = await SalesReturn.findById(id).lean();
    if (!previousRecord) {
      return res.status(404).json({
        success: false,
        message: "Sales return record not found",
      });
    }

    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerName",
      "products",
    ];

    for (const field of requiredFields) {
      if (updatedData[field] === undefined || updatedData[field] === null) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
        });
      }
    }

    // Handle stock changes per product
    for (const newProduct of updatedData.products) {
      const oldProduct = previousRecord.products.find(
        (p) => p.productName === newProduct.productName,
      );

      if (oldProduct) {
        const oldReturnQty = oldProduct.returnQuantity || 0;
        const newReturnQty = Number(newProduct.returnQuantity) || 0;

        if (oldReturnQty !== newReturnQty) {
          await updateStockQuantityDifference(
            newProduct.productName,
            oldReturnQty,
            newReturnQty,
            updatedData.invoiceNumber,
            id,
            newProduct.lc || oldProduct.lc || 0,
          );
        }
      }
    }

    const mappedProducts = updatedData.products.map((p) => ({
      productName: p.productName || "",
      salesQty: Number(p.salesQty) || 0,
      bonusQty: Number(p.bonusQty) || 0,
      sellingPrice: Number(p.sellingPrice) || 0,
      discount: Number(p.discount) || 0,
      lc: Number(p.lc) || 0,
      returnQuantity: Number(p.returnQuantity) || 0,
      usedPrice: Number(p.usedPrice) || Number(p.sellingPrice) || 0,
      usedQty: Number(p.usedQty) || 0,
      usedAmount: Number(p.usedAmount) || 0,
      totalQty: Number(p.totalQty) || 0,
      amount: Number(p.amount) || 0,
      netSellingAmount: Number(p.netSellingAmount) || 0,
      averageUnitPrice: Number(p.averageUnitPrice) || 0,
      profitLoss: Number(p.profitLoss) || 0,
      isProductAccept: p.isProductAccept || false,
    }));

    const totalAmount = mappedProducts.reduce(
      (sum, p) => sum + (p.netSellingAmount || 0),
      0,
    );
    const paidAmount =
      parseFloat(updatedData.paidAmount) || parseFloat(updatedData.amount) || 0;
    const dueAmount = Math.max(0, totalAmount - paidAmount);
    const creditDays = parseInt(updatedData.creditDays) || 0;

    let dueDate = null;
    if (updatedData.invoiceDate && creditDays > 0) {
      const invoiceDateObj = new Date(updatedData.invoiceDate);
      dueDate = new Date(
        invoiceDateObj.setDate(invoiceDateObj.getDate() + creditDays),
      );
    }

    const updateData = {
      recordingDate: updatedData.recordingDate,
      invoiceNumber: updatedData.invoiceNumber,
      invoiceDate: updatedData.invoiceDate,
      mrName: updatedData.mrName,
      customerName: updatedData.customerName,
      customerId: updatedData.customerId,
      products: mappedProducts,
      creditDays,
      dueDate: dueDate || updatedData.dueDate,
      deliveryDate: updatedData.deliveryDate || updatedData.invoiceDate,
      paidAmount,
      dueAmount,
      totalAmount,
      paymentStatus: updatedData.paymentStatus || "Credit",
      remark: updatedData.remark || "",
      updatedAt: new Date(),
    };

    const updatedReturn = await SalesReturn.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedReturn) {
      return res.status(404).json({
        success: false,
        message: "Sales return record not found",
      });
    }

    try {
      const updatePromises = updatedReturn.products.map((product) =>
        SaleSummary.updateMany(
          {
            invoiceNumber: updatedReturn.invoiceNumber,
            "products.productName": product.productName,
          },
          {
            $set: {
              "products.$.isProductAccept": product.isProductAccept,
              "products.$.returnQuantity": product.returnQuantity,
              "products.$.usedQty": product.usedQty,
              "products.$.usedAmount": product.usedAmount,
              "products.$.profitLoss": product.profitLoss,
            },
          },
        ),
      );
      await Promise.all(updatePromises);
    } catch (updateError) {
      console.error("⚠️ Error updating sale summaries:", updateError.message);
    }

    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Sales Return: ${updatedReturn.invoiceNumber}`,
      tableName: "salesreturns",
      tableLabel: "Sales Return",
      recordId: updatedReturn._id,
      referenceNumber: updatedReturn.invoiceNumber,
      previousData: {
        invoiceNumber: previousRecord.invoiceNumber,
        customerName: previousRecord.customerName,
        mrName: previousRecord.mrName,
        totalAmount: previousRecord.totalAmount,
        productsCount: previousRecord.products.length,
      },
      newData: {
        invoiceNumber: updatedReturn.invoiceNumber,
        customerName: updatedReturn.customerName,
        mrName: updatedReturn.mrName,
        totalAmount: updatedReturn.totalAmount,
        productsCount: updatedReturn.products.length,
      },
      description: `Updated sales return for invoice ${updatedReturn.invoiceNumber}`,
      refField: "invoiceNumber",
    });

    // ── NEW ──
    await emitEvent(req, {
      eventType:  EVENT_TYPES.SALE_RETURN_UPDATED,
      entityType: "SalesReturn",
      entityId:   updatedReturn._id.toString(),
      status:     "SUCCESS",
      durationMs: Date.now() - _startMs,
      metadata: {
        invoiceNo:          updatedReturn.invoiceNumber,
        totalAmountBefore:  previousRecord.totalAmount,
        totalAmountAfter:   updatedReturn.totalAmount,
        snapshotBefore, 
      },
    });
    // ─────────

    return res.status(200).json({
      success: true,
      message: "Sales return updated successfully",
      data: updatedReturn,
    });
  } catch (error) {
    console.error("Error updating sales return:", error);
    await emitEvent(req, { // ── NEW ──
      eventType:    EVENT_TYPES.SALE_RETURN_UPDATED,
      entityType:   "SalesReturn",
      entityId:     req.params.id,
      status:       "FAILED",
      durationMs:   Date.now() - _startMs,
      errorMessage: error.message,
    });
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// ================== DELETE /:id ==================
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const { id } = req.params;
  const _startMs = Date.now(); // ── NEW ──
  const snapshotBefore = await captureSnapshotBefore();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid sales return ID",
    });
  }

  try {
    const recordToDelete = await SalesReturn.findById(id);

    if (!recordToDelete) {
      return res.status(404).json({
        success: false,
        message: "Sales return not found",
      });
    }

    console.log(`🗑️ Deleting sales return: ${recordToDelete.invoiceNumber}`);

    // Remove the return batch from ReportInHand using real _id
    for (const product of recordToDelete.products) {
      if (product.returnQuantity > 0) {
        console.log(
          `   Removing return for "${product.productName}": ` +
            `${product.returnQuantity} boxes, saleReturnId=${recordToDelete._id}`,
        );
        const result = await removeReturnBatchFromStock(
          product.productName,
          product.returnQuantity,
          recordToDelete.invoiceNumber,
          recordToDelete._id, // ← real _id for matching
          product.lc,
        );
        if (result.success) {
          console.log(
            `   ✅ Stock reverted for "${product.productName}": ` +
              `totalBoxes=${result.reportInHand?.totalBoxes}, ` +
              `totalAmount=${result.reportInHand?.totalAmount}`,
          );
        } else {
          console.log(
            `   ⚠️ Stock revert issue for "${product.productName}": ${result.error}`,
          );
        }
      }
    }

    await SalesReturn.findByIdAndDelete(id);

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Sales Return: ${recordToDelete.invoiceNumber}`,
      tableName: "salesreturns",
      tableLabel: "Sales Return",
      recordId: recordToDelete._id,
      referenceNumber: recordToDelete.invoiceNumber,
      previousData: {
        invoiceNumber: recordToDelete.invoiceNumber,
        customerName: recordToDelete.customerName,
        totalAmount: recordToDelete.totalAmount,
      },
      description: `Deleted sales return for invoice ${recordToDelete.invoiceNumber}`,
    });

    // ── NEW ──
    await emitEvent(req, {
      eventType:  EVENT_TYPES.SALE_RETURN_CREATED,
      entityType: "SalesReturn",
      entityId:   id,
      status:     "SUCCESS",
      durationMs: Date.now() - _startMs,
      changes: recordToDelete.products
        .filter(p => p.returnQuantity > 0)
        .map(p => ({
          module: "ReportInHand",
          action: "RETURN_BATCH_REMOVED",
          field:  p.productName,
          after:  0,
          status: "SUCCESS",
        })),
      metadata: {
        invoiceNo:    recordToDelete.invoiceNumber,
        customerName: recordToDelete.customerName,
        totalAmount:  recordToDelete.totalAmount,
        deleted:      true,
        snapshotBefore,
      },
    });
    // ─────────

    return res.status(200).json({
      success: true,
      message: "Sales return deleted successfully and stock restored",
    });
  } catch (error) {
    console.error("Error deleting sales return:", error);
    await emitEvent(req, { // ── NEW ──
      eventType:    EVENT_TYPES.SALE_RETURN_CREATED,
      entityType:   "SalesReturn",
      entityId:     req.params.id,
      status:       "FAILED",
      durationMs:   Date.now() - _startMs,
      errorMessage: error.message,
    });
    return res.status(500).json({
      success: false,
      message: "Server error while deleting sales return",
      error: error.message,
    });
  }
});

// ================== DELETE / (multiple) ==================
router.delete("/", protect, allowAdminOnly, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No sale return IDs provided for deletion",
      });
    }

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

    const recordsToDelete = await SalesReturn.find({ _id: { $in: validIds } });
    console.log(`🗑️ Bulk deleting ${recordsToDelete.length} sales returns`);

    for (const record of recordsToDelete) {
      console.log(`   Processing: ${record.invoiceNumber}`);
      for (const product of record.products) {
        if (product.returnQuantity > 0) {
          console.log(
            `      Removing ${product.returnQuantity} boxes of "${product.productName}", ` +
              `saleReturnId=${record._id}`,
          );
          await removeReturnBatchFromStock(
            product.productName,
            product.returnQuantity,
            record.invoiceNumber,
            record._id, // ← real _id
            product.lc,
          );
        }
      }
    }

    const result = await SalesReturn.deleteMany({ _id: { $in: validIds } });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No sale returns found with the provided IDs",
      });
    }

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Sales Return(s)`,
      tableName: "salesreturns",
      tableLabel: "Sales Return",
      previousData: recordsToDelete.map((record) => ({
        invoiceNumber: record.invoiceNumber,
        customerName: record.customerName,
        totalAmount: record.totalAmount,
      })),
      description: `Deleted ${result.deletedCount} sales returns. Invoices: ${recordsToDelete.map((r) => r.invoiceNumber).join(", ")}`,
      refField: "invoiceNumber",
    });

    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} sale return(s) deleted successfully and stock restored`,
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

// ================== POST /download-excel ==================
router.post("/download-excel", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    const filteredReturns = await SalesReturn.find({
      invoiceDate: { $gte: start, $lte: end },
    })
      .populate("customerId")
      .sort({ invoiceDate: 1 });

    if (filteredReturns.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No sales return data found for the selected date range",
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sales Return Summary");

    worksheet.mergeCells("A1:AD1");
    worksheet.getCell("A1").value = "HEALTHCARE SOUTH EAST ASIA";
    worksheet.getCell("A1").font = { bold: true, size: 16 };
    worksheet.getCell("A1").alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    worksheet.mergeCells("A2:AD2");
    worksheet.getCell("A2").value =
      `Sales Return Summary (${formatDateToReadable(startDate)} - ${formatDateToReadable(endDate)})`;
    worksheet.getCell("A2").font = { bold: true, size: 14 };
    worksheet.getCell("A2").alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    worksheet.columns = [
      { key: "no", width: 5 },
      { key: "recordingDate", width: 18 },
      { key: "invoiceNumber", width: 18 },
      { key: "invoiceDate", width: 18 },
      { key: "mrName", width: 18 },
      { key: "customerName", width: 25 },
      { key: "productName", width: 25 },
      { key: "salesQty", width: 10 },
      { key: "bonusQty", width: 10 },
      { key: "totalQty", width: 10 },
      { key: "sellingPrice", width: 12 },
      { key: "productAmount", width: 12 },
      { key: "discount", width: 10 },
      { key: "netSellingAmount", width: 25 },
      { key: "averageUnitPrice", width: 25 },
      { key: "lc", width: 10 },
      { key: "profitLoss", width: 12 },
      { key: "returnQuantity", width: 12 },
      { key: "usedQty", width: 10 },
      { key: "usedPrice", width: 12 },
      { key: "usedAmount", width: 12 },
      { key: "isProductAccept", width: 15 },
      { key: "creditDays", width: 15 },
      { key: "dueDate", width: 15 },
      { key: "deliveryDate", width: 20 },
      { key: "paidAmount", width: 15 },
      { key: "dueAmount", width: 15 },
      { key: "totalAmount", width: 15 },
      { key: "paymentStatus", width: 15 },
      { key: "remark", width: 20 },
    ];

    const headerRow = worksheet.getRow(3);
    headerRow.values = [
      "No",
      "Recording Date",
      "Invoice Number",
      "Invoice Date",
      "MR Name",
      "Customer Name",
      "Product Name",
      "Sales Qty",
      "Bonus Qty",
      "Total Qty",
      "Selling Price",
      "Product Amount",
      "Discount",
      "Net Selling Amount",
      "Average Unit Price",
      "LC",
      "Profit/Loss",
      "Return Quantity",
      "Used Qty",
      "Used Price",
      "Used Amount",
      "Product Accept",
      "Credit Days",
      "Due Date",
      "Delivery Date",
      "Paid Amount",
      "Due Amount",
      "Total Amount",
      "Payment Status",
      "Remark",
    ];
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    let index = 0;
    filteredReturns.forEach((sale) => {
      sale.products.forEach((prod) => {
        worksheet.addRow({
          no: ++index,
          recordingDate: sale.recordingDate,
          invoiceNumber: sale.invoiceNumber,
          invoiceDate: sale.invoiceDate,
          mrName: sale.mrName,
          customerName:
            sale.customerId?.name || sale.customerName || "Unknown Customer",
          productName: prod.productName,
          salesQty: prod.salesQty,
          bonusQty: prod.bonusQty,
          totalQty: prod.totalQty,
          sellingPrice: prod.sellingPrice,
          productAmount: prod.amount,
          discount: prod.discount,
          netSellingAmount: prod.netSellingAmount,
          averageUnitPrice: prod.averageUnitPrice,
          lc: prod.lc,
          profitLoss: prod.profitLoss,
          returnQuantity: prod.returnQuantity,
          usedQty: prod.usedQty,
          usedPrice: prod.usedPrice,
          usedAmount: prod.usedAmount,
          isProductAccept: prod.isProductAccept ? "Yes" : "No",
          creditDays: sale.creditDays,
          dueDate: sale.dueDate,
          deliveryDate: sale.deliveryDate,
          paidAmount: sale.paidAmount,
          dueAmount: sale.dueAmount,
          totalAmount: sale.totalAmount,
          paymentStatus: sale.paymentStatus,
          remark: sale.remark,
        });
      });
    });

    const fileName = `sales_return_summary_${formatDateToReadable(startDate)}_to_${formatDateToReadable(endDate)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Error generating Sales Return Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Sales Return Excel",
      error: error.message,
    });
  }
});

export default router;