import express from "express";
import mongoose from "mongoose";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

const router = express.Router();

// ─── Helper: get collections ──────────────────────────────────────────────────
const getCollections = () => ({
  stockTransferToMrs: mongoose.connection.db.collection("stocktransfertomrs"),
  stockInMrHands: mongoose.connection.db.collection("stockinmrhands"),
});

// ─── Helper: find Staff by name ───────────────────────────────────────────────
const findStaffByName = async (mrName, session = null) => {
  const Staff = mongoose.connection.db.collection("staffs");
  const query = { medicalRepName: { $regex: new RegExp(`^${mrName.trim()}$`, "i") } };
  return session
    ? Staff.findOne(query, { session })
    : Staff.findOne(query);
};

// ─── Helper: find MR stock record by mrId ─────────────────────────────────────
const findMRStock = async (mrId, session = null) => {
  const { stockInMrHands } = getCollections();
  const filter = { mrId: new mongoose.Types.ObjectId(mrId) };
  return session
    ? stockInMrHands.findOne(filter, { session })
    : stockInMrHands.findOne(filter);
};

// ─────────────────────────────────────────────────────────────────────────────
// CORE FIX: upsertProductsIntoMRHand
//
// This function is the missing piece. After a transfer is saved to
// stocktransfertomrs, this is called to actually write the products
// into stockinmrhands.productsInHand.
//
// Logic:
//  - If the MR stock record doesn't exist → create it with all products
//  - If it exists → for each product:
//      * If the product is already in productsInHand → increment quantity
//      * If not → push a new product entry
// ─────────────────────────────────────────────────────────────────────────────
const upsertProductsIntoMRHand = async (mrId, mrName, items, session) => {
  const { stockInMrHands } = getCollections();
  const mrObjectId = new mongoose.Types.ObjectId(mrId);

  // Fetch current MR stock record
  const existing = await stockInMrHands.findOne({ mrId: mrObjectId }, { session });

  if (!existing) {
    // ── Create new MR stock record with all products ──────────────────────
    const productsInHand = items
      .filter((item) => item.boxQuantity > 0)
      .map((item) => ({
        _id: new mongoose.Types.ObjectId(),
        productId: item.productId ? new mongoose.Types.ObjectId(item.productId) : null,
        productName: item.productName.trim(),
        quantity: Number(item.boxQuantity) || 0,
        lc: Number(item.lc) || 0,
        lastUpdated: new Date(),
      }));

    await stockInMrHands.insertOne(
      {
        mrId: mrObjectId,
        mrName: mrName.trim(),
        productsInHand,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { session }
    );
  } else {
    // ── MR stock record exists — merge products one by one ───────────────
    for (const item of items) {
      if (!item.boxQuantity || item.boxQuantity <= 0) continue;

      const productName = item.productName.trim();
      const addQty = Number(item.boxQuantity) || 0;
      const lc = Number(item.lc) || 0;

      // Check if this product already exists in productsInHand
      const productIndex = (existing.productsInHand || []).findIndex(
        (p) => p.productName?.toLowerCase().trim() === productName.toLowerCase()
      );

      if (productIndex >= 0) {
        // Product exists → increment its quantity
        await stockInMrHands.updateOne(
          {
            mrId: mrObjectId,
            "productsInHand.productName": existing.productsInHand[productIndex].productName,
          },
          {
            $inc: { "productsInHand.$.quantity": addQty },
            $set: {
              "productsInHand.$.lastUpdated": new Date(),
              // Update lc only if the new lc is non-zero
              ...(lc > 0 ? { "productsInHand.$.lc": lc } : {}),
              updatedAt: new Date(),
            },
          },
          { session }
        );
      } else {
        // Product doesn't exist → push new entry
        await stockInMrHands.updateOne(
          { mrId: mrObjectId },
          {
            $push: {
              productsInHand: {
                _id: new mongoose.Types.ObjectId(),
                productId: item.productId ? new mongoose.Types.ObjectId(item.productId) : null,
                productName,
                quantity: addQty,
                lc,
                lastUpdated: new Date(),
              },
            },
            $set: { updatedAt: new Date() },
          },
          { session }
        );
      }
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REVERSE: removeProductsFromMRHand
//
// Used when a transfer is deleted or updated — reverts the quantities.
// ─────────────────────────────────────────────────────────────────────────────
const removeProductsFromMRHand = async (mrId, items, session) => {
  const { stockInMrHands } = getCollections();
  const mrObjectId = new mongoose.Types.ObjectId(mrId);

  const existing = await stockInMrHands.findOne({ mrId: mrObjectId }, { session });
  if (!existing) return; // nothing to revert

  for (const item of items) {
    if (!item.boxQuantity || item.boxQuantity <= 0) continue;

    const productName = item.productName.trim();
    const removeQty = Number(item.boxQuantity) || 0;

    const productEntry = (existing.productsInHand || []).find(
      (p) => p.productName?.toLowerCase().trim() === productName.toLowerCase()
    );

    if (!productEntry) continue;

    const newQty = Math.max(0, (productEntry.quantity || 0) - removeQty);

    if (newQty === 0) {
      // Remove the product entirely from the array
      await stockInMrHands.updateOne(
        { mrId: mrObjectId },
        {
          $pull: { productsInHand: { productName: productEntry.productName } },
          $set: { updatedAt: new Date() },
        },
        { session }
      );
    } else {
      // Just reduce the quantity
      await stockInMrHands.updateOne(
        {
          mrId: mrObjectId,
          "productsInHand.productName": productEntry.productName,
        },
        {
          $set: {
            "productsInHand.$.quantity": newQty,
            "productsInHand.$.lastUpdated": new Date(),
            updatedAt: new Date(),
          },
        },
        { session }
      );
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: deduct from ReportInHand (warehouse) when sending stock to MR
// ─────────────────────────────────────────────────────────────────────────────
const deductFromWarehouse = async (items, invoiceNo, session) => {
  const ReportInHand = mongoose.connection.db.collection("reportinhands");

  for (const item of items) {
    if (!item.boxQuantity || item.boxQuantity <= 0) continue;

    const productName = item.productName.trim();
    const qty = Number(item.boxQuantity) || 0;

    const warehouseItem = await ReportInHand.findOne(
      { productName: { $regex: new RegExp(`^${productName}$`, "i") } },
      { session }
    );

    if (!warehouseItem) {
      console.warn(`⚠️ Product "${productName}" not found in warehouse (ReportInHand)`);
      continue;
    }

    // Push a removal batch entry
    await ReportInHand.updateOne(
      { _id: warehouseItem._id },
      {
        $push: {
          batches: {
            _id: new mongoose.Types.ObjectId(),
            boxes: qty,
            lc: item.lc || 0,
            fob: item.lc || 0,
            cif: item.lc || 0,
            amount: qty * (item.lc || 0),
            date: new Date(),
            adjustmentType: "remove",
            batchNumber: `MR-TRANSFER-${invoiceNo}-${Date.now()}`,
          },
        },
      },
      { session }
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: restore to ReportInHand (warehouse) when transfer is deleted or
// when MR returns stock back to main
// ─────────────────────────────────────────────────────────────────────────────
const restoreToWarehouse = async (items, invoiceNo, session) => {
  const ReportInHand = mongoose.connection.db.collection("reportinhands");

  for (const item of items) {
    if (!item.boxQuantity || item.boxQuantity <= 0) continue;

    const productName = item.productName.trim();
    const qty = Number(item.boxQuantity) || 0;
    const lc = Number(item.lc) || 0;

    const warehouseItem = await ReportInHand.findOne(
      { productName: { $regex: new RegExp(`^${productName}$`, "i") } },
      { session }
    );

    if (warehouseItem) {
      await ReportInHand.updateOne(
        { _id: warehouseItem._id },
        {
          $push: {
            batches: {
              _id: new mongoose.Types.ObjectId(),
              boxes: qty,
              lc,
              fob: lc,
              cif: lc,
              amount: qty * lc,
              date: new Date(),
              adjustmentType: "batch",
              batchNumber: `RESTORE-${invoiceNo}-${Date.now()}`,
            },
          },
        },
        { session }
      );
    } else {
      // Product doesn't exist in warehouse — create it
      await ReportInHand.insertOne(
        {
          productName,
          supplierName: "System",
          type: "System",
          batches: [
            {
              _id: new mongoose.Types.ObjectId(),
              boxes: qty,
              lc,
              fob: lc,
              cif: lc,
              amount: qty * lc,
              date: new Date(),
              adjustmentType: "batch",
              batchNumber: `RESTORE-${invoiceNo}-${Date.now()}`,
            },
          ],
          status: "In Stock",
          minStockLevel: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { session }
      );
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: generate next invoice number
// ─────────────────────────────────────────────────────────────────────────────
const generateInvoiceNo = async () => {
  const { stockTransferToMrs } = getCollections();
  const lastDoc = await stockTransferToMrs.findOne({}, { sort: { createdAt: -1 } });

  if (!lastDoc || !lastDoc.invoiceNo) return "ST-0001";

  const match = lastDoc.invoiceNo.match(/ST-(\d+)/);
  if (!match) return "ST-0001";

  const nextNum = parseInt(match[1], 10) + 1;
  return `ST-${String(nextNum).padStart(4, "0")}`;
};

// ==========================================
// ROUTES
// ==========================================

// ── GET ALL TRANSFERS ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { stockTransferToMrs } = getCollections();
    const transfers = await stockTransferToMrs
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, data: transfers, count: transfers.length });
  } catch (error) {
    console.error("Error fetching transfers:", error);
    res.status(500).json({ success: false, message: "Failed to fetch transfers", error: error.message });
  }
});

// ── GET SINGLE TRANSFER ───────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { stockTransferToMrs } = getCollections();
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const transfer = await stockTransferToMrs.findOne({
      _id: new mongoose.Types.ObjectId(req.params.id),
    });

    if (!transfer) {
      return res.status(404).json({ success: false, message: "Transfer not found" });
    }

    res.json({ success: true, data: transfer });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch transfer", error: error.message });
  }
});

// ── GET MR HAND STOCK ─────────────────────────────────────────────────────────
router.get("/mr-stock/:mrId", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.mrId)) {
      return res.status(400).json({ success: false, message: "Invalid MR ID" });
    }

    const mrStock = await findMRStock(req.params.mrId);

    if (!mrStock) {
      return res.json({ success: true, data: { productsInHand: [] }, mrName: null });
    }

    res.json({ success: true, data: mrStock, mrName: mrStock.mrName });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch MR stock", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE TRANSFER (send stock from warehouse → MR hand)
//
// THE MAIN FIX IS HERE: after saving to stocktransfertomrs, we now call
// upsertProductsIntoMRHand() to write the products into stockinmrhands.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      transferType = "send",
      stockTransferToMr,
      stockTransferFromMrToMain,
      items,
      date,
      remarks,
    } = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error("Items are required");
    }

    const validItems = items.filter(
      (item) => item.productName && item.boxQuantity > 0
    );
    if (validItems.length === 0) {
      throw new Error("At least one item with valid quantity is required");
    }

    const { stockTransferToMrs } = getCollections();

    const invoiceNo = await generateInvoiceNo();
    const transferDate = date || new Date().toISOString().split("T")[0];

    let targetMrId = null;
    let targetMrName = null;

    if (transferType === "send" && stockTransferToMr) {
      // ── Find MR from Staff collection ─────────────────────────────────
      const staff = await findStaffByName(stockTransferToMr, session);
      if (!staff) {
        throw new Error(`MR "${stockTransferToMr}" not found in Staff system`);
      }
      targetMrId = staff._id;
      targetMrName = staff.medicalRepName;
    }

    // ── Calculate total cost ───────────────────────────────────────────
    const totalTransferCost = validItems.reduce((sum, item) => {
      return sum + (Number(item.boxQuantity) || 0) * (Number(item.lc) || 0);
    }, 0);

    // ── Build transfer document ────────────────────────────────────────
    const transferDoc = {
      invoiceNo,
      date: transferDate,
      transferType,
      stockTransferToMr: stockTransferToMr || "",
      stockTransferFromMrToMain: stockTransferFromMrToMain || "",
      items: validItems.map((item) => ({
        _id: new mongoose.Types.ObjectId(),
        productId: item.productId ? new mongoose.Types.ObjectId(item.productId) : null,
        productName: item.productName.trim(),
        boxQuantity: Number(item.boxQuantity) || 0,
        lc: Number(item.lc) || 0,
        productCost: (Number(item.boxQuantity) || 0) * (Number(item.lc) || 0),
      })),
      remarks: remarks || "",
      totalTransferCost,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // ── Save to stocktransfertomrs ─────────────────────────────────────
    const result = await stockTransferToMrs.insertOne(transferDoc, { session });

    // ── THE FIX: Update stockinmrhands ────────────────────────────────
    if (transferType === "send" && targetMrId) {
      // Deduct from warehouse
      await deductFromWarehouse(validItems, invoiceNo, session);

      // Write products into MR hand stock
      await upsertProductsIntoMRHand(
        targetMrId,
        targetMrName,
        validItems,
        session
      );
    } else if (transferType === "return" && stockTransferFromMrToMain) {
      // MR returning stock back to warehouse
      const staff = await findStaffByName(stockTransferFromMrToMain, session);
      if (staff) {
        await removeProductsFromMRHand(staff._id, validItems, session);
        await restoreToWarehouse(validItems, invoiceNo, session);
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: `Stock transfer ${invoiceNo} created successfully`,
      data: { ...transferDoc, _id: result.insertedId },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating stock transfer:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create transfer" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE TRANSFER
//
// Reverses the old transfer's effect on stockinmrhands, then applies new.
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid transfer ID");
    }

    const { stockTransferToMrs } = getCollections();

    // ── Fetch the existing transfer ────────────────────────────────────
    const existing = await stockTransferToMrs.findOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { session }
    );
    if (!existing) throw new Error("Transfer not found");

    const {
      transferType = existing.transferType,
      stockTransferToMr = existing.stockTransferToMr,
      items,
      date,
      remarks,
    } = req.body;

    const validNewItems = (items || []).filter(
      (item) => item.productName && item.boxQuantity > 0
    );

    // ── Reverse the OLD transfer effect ────────────────────────────────
    if (existing.transferType === "send" && existing.stockTransferToMr) {
      const oldStaff = await findStaffByName(existing.stockTransferToMr, session);
      if (oldStaff) {
        await removeProductsFromMRHand(oldStaff._id, existing.items, session);
        await restoreToWarehouse(existing.items, existing.invoiceNo, session);
      }
    } else if (existing.transferType === "return" && existing.stockTransferFromMrToMain) {
      const oldStaff = await findStaffByName(existing.stockTransferFromMrToMain, session);
      if (oldStaff) {
        await upsertProductsIntoMRHand(oldStaff._id, oldStaff.medicalRepName, existing.items, session);
        await deductFromWarehouse(existing.items, existing.invoiceNo, session);
      }
    }

    // ── Apply the NEW transfer effect ──────────────────────────────────
    let targetMrId = null;
    let targetMrName = null;

    if (transferType === "send" && stockTransferToMr) {
      const newStaff = await findStaffByName(stockTransferToMr, session);
      if (!newStaff) throw new Error(`MR "${stockTransferToMr}" not found`);
      targetMrId = newStaff._id;
      targetMrName = newStaff.medicalRepName;

      await deductFromWarehouse(validNewItems, existing.invoiceNo, session);
      await upsertProductsIntoMRHand(targetMrId, targetMrName, validNewItems, session);
    }

    const totalTransferCost = validNewItems.reduce((sum, item) => {
      return sum + (Number(item.boxQuantity) || 0) * (Number(item.lc) || 0);
    }, 0);

    // ── Save updated transfer ──────────────────────────────────────────
    const updateData = {
      transferType,
      stockTransferToMr: stockTransferToMr || existing.stockTransferToMr,
      items: validNewItems.map((item) => ({
        _id: new mongoose.Types.ObjectId(),
        productId: item.productId ? new mongoose.Types.ObjectId(item.productId) : null,
        productName: item.productName.trim(),
        boxQuantity: Number(item.boxQuantity) || 0,
        lc: Number(item.lc) || 0,
        productCost: (Number(item.boxQuantity) || 0) * (Number(item.lc) || 0),
      })),
      date: date || existing.date,
      remarks: remarks !== undefined ? remarks : existing.remarks,
      totalTransferCost,
      updatedAt: new Date(),
    };

    await stockTransferToMrs.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: updateData },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, message: "Transfer updated successfully", data: { ...existing, ...updateData } });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating transfer:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update transfer" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE TRANSFER — reverts stockinmrhands and restores warehouse stock
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid transfer ID");
    }

    const { stockTransferToMrs } = getCollections();

    const transfer = await stockTransferToMrs.findOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { session }
    );
    if (!transfer) throw new Error("Transfer not found");

    // ── Reverse the transfer effect ────────────────────────────────────
    if (transfer.transferType === "send" && transfer.stockTransferToMr) {
      const staff = await findStaffByName(transfer.stockTransferToMr, session);
      if (staff) {
        await removeProductsFromMRHand(staff._id, transfer.items, session);
      }
      await restoreToWarehouse(transfer.items, transfer.invoiceNo, session);
    } else if (transfer.transferType === "return" && transfer.stockTransferFromMrToMain) {
      const staff = await findStaffByName(transfer.stockTransferFromMrToMain, session);
      if (staff) {
        await upsertProductsIntoMRHand(staff._id, staff.medicalRepName, transfer.items, session);
      }
      await deductFromWarehouse(transfer.items, transfer.invoiceNo, session);
    }

    await stockTransferToMrs.deleteOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, message: `Transfer ${transfer.invoiceNo} deleted and stock reverted` });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting transfer:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to delete transfer" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME MIGRATION ROUTE
//
// Call POST /api/stock-transfer/migrate/backfill-mr-hands ONCE to fix all
// existing transfers that never wrote into stockinmrhands.
//
// Safe to call multiple times — it checks existing quantities first.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/migrate/backfill-mr-hands", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { stockTransferToMrs, stockInMrHands } = getCollections();

    // Fetch all "send" transfers sorted oldest first
    const transfers = await stockTransferToMrs
      .find({ transferType: "send" })
      .sort({ createdAt: 1 })
      .toArray();

    if (transfers.length === 0) {
      await session.commitTransaction();
      session.endSession();
      return res.json({ success: true, message: "No transfers to migrate", processed: 0 });
    }

    // Clear ALL existing stockinmrhands records so we start fresh
    await stockInMrHands.deleteMany({}, { session });

    let processed = 0;
    let failed = 0;
    const errors = [];

    for (const transfer of transfers) {
      try {
        if (!transfer.stockTransferToMr || !transfer.items?.length) continue;

        const staff = await findStaffByName(transfer.stockTransferToMr, session);
        if (!staff) {
          errors.push(`MR "${transfer.stockTransferToMr}" not found (transfer ${transfer.invoiceNo})`);
          failed++;
          continue;
        }

        // For each send transfer, add the products into MR hand
        await upsertProductsIntoMRHand(staff._id, staff.medicalRepName, transfer.items, session);
        processed++;
      } catch (err) {
        errors.push(`Transfer ${transfer.invoiceNo}: ${err.message}`);
        failed++;
      }
    }

    // Also process "return" transfers to subtract back
    const returnTransfers = await stockTransferToMrs
      .find({ transferType: "return" })
      .sort({ createdAt: 1 })
      .toArray();

    for (const transfer of returnTransfers) {
      try {
        if (!transfer.stockTransferFromMrToMain || !transfer.items?.length) continue;

        const staff = await findStaffByName(transfer.stockTransferFromMrToMain, session);
        if (!staff) continue;

        await removeProductsFromMRHand(staff._id, transfer.items, session);
      } catch (err) {
        errors.push(`Return transfer ${transfer.invoiceNo}: ${err.message}`);
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `Migration complete: ${processed} send transfers processed, ${failed} failed`,
      processed,
      failed,
      errors,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Migration error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
