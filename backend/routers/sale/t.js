import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import PaymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
import ExcelJS from "exceljs";
import SalesReturn from "../../models/sale/saleReturn.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Customer from "../../models/master/customer.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import mongoose from "mongoose";

const router = express.Router();
let importProgressMap = new Map();

const createSessionId = () =>
  `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const normalizeProductName = (name) => {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
};

const getStrictNormalizedProductName = (name) => {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
};

const productNameFixMap = {
  "n-lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n-lycopene+wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n flaxseed oil": "N-FLAXSEED OIL",
  "flaxseed oil": "N-FLAXSEED OIL",
  "n evening primrose oil": "N-EVENING PRIMROSE OIL",
  "evening primrose oil": "N-EVENING PRIMROSE OIL",
  "n multiz": "N-MULTIZ",
  multiz: "N-MULTIZ",
  "n garlic oil": "N-GARLIC OIL",
  "garlic oil": "N-GARLIC OIL",
  "n fenugreek oil": "N-FENUGREEK OIL",
  "fenugreek oil": "N-FENUGREEK OIL",
  "n nigella oil": "N-NIGELLA OIL",
  "nigella oil": "N-NIGELLA OIL",
  "n krill oil": "N-KRILL OIL",
  "krill oil": "N-KRILL OIL",
  "n sea buckthorn & oil lutein extract": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",
  "ecomol 500": "ECOMOL 500",
  ecomol500: "ECOMOL 500",
  "ecomol-500": "ECOMOL 500",
  ecomol: "ECOMOL 500",
};

const findMRStaff = async (mrName, mrId) => {
  let mrStaff = null;
  if (mrId && mongoose.Types.ObjectId.isValid(mrId)) {
    mrStaff = await Staff.findById(mrId).lean();
  }
  if (!mrStaff && mrName && mrName.trim() && mrName.trim() !== "No MR Name Provided") {
    mrStaff = await Staff.findOne({
      $or: [
        { name: { $regex: new RegExp("^" + mrName.trim() + "$", "i") } },
        { name: { $regex: new RegExp(mrName.trim(), "i") } },
        { email: { $regex: new RegExp(mrName.trim(), "i") } },
      ],
    }).lean();
  }
  return mrStaff;
};

const addCashToMR = async (saleData, existingCashAmount = 0) => {
  try {
    const {
      mrName = "No MR Name Provided",
      mrId,
      paidAmount = 0,
      invoiceNumber,
      invoiceDate,
      customerName,
      paymentStatus,
    } = saleData;

    if (!((paymentStatus === "Cash" || paymentStatus === "Paid") && paidAmount > 0)) {
      return { success: false, reason: "Not cash/paid or zero amount" };
    }

    const mrStaff = await findMRStaff(mrName, mrId);
    if (!mrStaff) {
      console.warn(`⚠️ MR not found: "${mrName}" (ID: ${mrId})`);
      return { success: false, reason: "MR not found" };
    }

    let mrCash = await MRCash.findOne({ mrId: mrStaff._id });
    const netAdd = existingCashAmount > 0 ? paidAmount - existingCashAmount : paidAmount;

    if (netAdd === 0) {
      return { success: true, currentCash: mrCash?.currentCash || 0 };
    }

    if (!mrCash) {
      mrCash = new MRCash({
        mrId: mrStaff._id,
        mrName: mrStaff.name || mrName,
        currentCash: paidAmount,
        cashTransferredToAdmin: 0,
        notes: `Initial cash from invoice ${invoiceNumber}`,
        recentTransactions: [{
          invoiceNumber,
          amount: netAdd,
          type: "sale",
          date: invoiceDate || new Date(),
          notes: `Sale to ${customerName || "Unknown"}`,
        }],
      });
    } else {
      mrCash.currentCash = (mrCash.currentCash || 0) + netAdd;
      const note = `${netAdd > 0 ? "Added" : "Adjusted"} $${Math.abs(netAdd)} from invoice ${invoiceNumber}`;
      mrCash.notes = mrCash.notes ? `${mrCash.notes}\n${note}` : note;

      mrCash.recentTransactions = mrCash.recentTransactions || [];
      mrCash.recentTransactions.push({
        invoiceNumber,
        amount: netAdd,
        type: netAdd > 0 ? "sale" : "adjustment",
        date: invoiceDate || new Date(),
        notes: `Sale to ${customerName || "Unknown"}`,
      });
      if (mrCash.recentTransactions.length > 50) {
        mrCash.recentTransactions = mrCash.recentTransactions.slice(-50);
      }
    }

    await mrCash.save(); // Critical: await save
    console.log(`✅ Cash updated for MR "${mrStaff.name}": +$${netAdd} → $${mrCash.currentCash}`);

    return {
      success: true,
      mrName: mrStaff.name,
      mrId: mrStaff._id,
      amountAdded: netAdd,
      currentCash: mrCash.currentCash,
    };
  } catch (error) {
    console.error("❌ addCashToMR failed:", error);
    throw error;
  }
};

const removeCashFromMR = async (saleData) => {
  try {
    const { mrName, mrId, paidAmount, invoiceNumber, customerName } = saleData;
    if (paidAmount <= 0) return { success: false };

    const mrStaff = await findMRStaff(mrName, mrId);
    if (!mrStaff) return { success: false };

    const mrCash = await MRCash.findOne({ mrId: mrStaff._id });
    if (!mrCash) return { success: false };

    mrCash.currentCash = Math.max(0, mrCash.currentCash - paidAmount);
    const note = `Removed $${paidAmount} (delete/return) - invoice ${invoiceNumber}`;
    mrCash.notes = mrCash.notes ? `${mrCash.notes}\n${note}` : note;

    mrCash.recentTransactions = mrCash.recentTransactions || [];
    mrCash.recentTransactions.push({
      invoiceNumber,
      amount: -paidAmount,
      type: "return",
      date: new Date(),
      notes: `Removed from ${customerName || "Unknown"}`,
    });
    if (mrCash.recentTransactions.length > 50) {
      mrCash.recentTransactions = mrCash.recentTransactions.slice(-50);
    }

    await mrCash.save();
    return { success: true, amountRemoved: paidAmount, currentCash: mrCash.currentCash };
  } catch (error) {
    console.error("❌ removeCashFromMR failed:", error);
    throw error;
  }
};

const findProductInInventory = async (productName) => {
  try {
    const normalized = normalizeProductName(productName);
    const strict = getStrictNormalizedProductName(productName);
    const fixed = productNameFixMap[normalized] || productNameFixMap[strict];

    if (fixed) {
      const match = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${fixed}$`, "i") },
      });
      if (match) return match;
    }

    const allProducts = await ReportInHand.find({});
    for (const p of allProducts) {
      const pNorm = normalizeProductName(p.productName);
      const pStrict = getStrictNormalizedProductName(p.productName);
      if (
        p.productName.toLowerCase() === productName.toLowerCase() ||
        pNorm === normalized ||
        pStrict === strict ||
        p.productName.toLowerCase().includes(productName.toLowerCase()) ||
        productName.toLowerCase().includes(p.productName.toLowerCase())
      ) {
        return p;
      }
      if (productName.toLowerCase().includes("ecomol") && p.productName.toLowerCase().includes("ecomol")) {
        return p;
      }
    }
    return null;
  } catch (error) {
    console.error("Product finder error:", error);
    return null;
  }
};

const updateReportInHandAfterSale = async (productName, salesQty, bonusQty = 0) => {
  const totalQty = salesQty + bonusQty;
  if (totalQty === 0) return;

  const product = await findProductInInventory(productName);
  if (!product) throw new Error(`Product "${productName}" not found in inventory`);

  let currentStock = product.totalBoxes || product.currentStock || product.boxes || 0;
  if (currentStock < totalQty && totalQty > 0) {
    throw new Error(`Insufficient stock for "${product.productName}": ${currentStock} < ${totalQty}`);
  }

  const newStock = currentStock - totalQty;
  const status = newStock === 0 ? "Out of Stock" : newStock < 5 ? "Critical" : newStock < 15 ? "Low Stock" : "In Stock";

  await ReportInHand.findByIdAndUpdate(product._id, {
    $set: {
      totalBoxes: newStock,
      currentStock: newStock,
      boxes: newStock,
      status,
    },
  });
};

const updateInventoryForExchange = async (
  productName,
  salesQty,
  bonusQty,
  isIncoming = false
) => {
  try {
    const totalQty = salesQty + bonusQty;
    if (totalQty === 0) return 0;

    const existingProduct = await findProductInInventory(productName);
    if (!existingProduct) throw new Error(`Product "${productName}" not found in inventory.`);

    let currentStock = 0;
    if (existingProduct.batches && Array.isArray(existingProduct.batches) && existingProduct.batches.length > 0) {
      currentStock = existingProduct.batches.reduce((total, batch) => total + (batch.boxes || 0), 0);
    } else if (existingProduct.totalBoxes !== undefined) {
      currentStock = existingProduct.totalBoxes;
    } else if (existingProduct.currentStock !== undefined) {
      currentStock = existingProduct.currentStock;
    } else {
      currentStock = existingProduct.boxes || 0;
    }

    let updatedStock;
    if (isIncoming) {
      updatedStock = currentStock + Math.abs(totalQty);
    } else {
      if (currentStock < Math.abs(totalQty)) {
        throw new Error(`Insufficient stock for exchange: "${existingProduct.productName}". Available: ${currentStock}, Required: ${Math.abs(totalQty)}`);
      }
      updatedStock = currentStock - Math.abs(totalQty);
    }

    let updateFields = {};
    if (existingProduct.batches && Array.isArray(existingProduct.batches) && existingProduct.batches.length > 0) {
      const updatedBatches = [...existingProduct.batches];
      if (isIncoming) {
        updatedBatches[0].boxes += Math.abs(totalQty);
      } else {
        let remaining = Math.abs(totalQty);
        for (let i = 0; i < updatedBatches.length && remaining > 0; i++) {
          if (updatedBatches[i].boxes >= remaining) {
            updatedBatches[i].boxes -= remaining;
            remaining = 0;
          } else {
            remaining -= updatedBatches[i].boxes;
            updatedBatches[i].boxes = 0;
          }
        }
      }
      updateFields.batches = updatedBatches;
      updateFields.totalBoxes = updatedStock;
    } else if (existingProduct.totalBoxes !== undefined) {
      updateFields.totalBoxes = updatedStock;
    } else if (existingProduct.currentStock !== undefined) {
      updateFields.currentStock = updatedStock;
    } else {
      updateFields.boxes = updatedStock;
    }

    const updatedStatus = updatedStock === 0 ? "Out of Stock" : updatedStock < 5 ? "Critical" : updatedStock < 15 ? "Low Stock" : "In Stock";
    updateFields.status = updatedStatus;

    await ReportInHand.findByIdAndUpdate(existingProduct._id, { $set: updateFields });

    return existingProduct.batches?.[0]?.lc || existingProduct.lc || 0;
  } catch (error) {
    console.error(`Error updating inventory for exchange "${productName}":`, error.message);
    throw error;
  }
};

const restoreReportInHandAfterSaleDeletion = async (
  productName,
  salesQty,
  bonusQty,
  isExchange = false,
  remark = "",
  paymentStatus = ""
) => {
  try {
    const isReturn = isReturnTransaction(remark, paymentStatus);
    const totalQty = salesQty + bonusQty;
    const isIncoming = totalQty < 0;

    if (isReturn) {
      const returnQty = Math.abs(salesQty) + Math.abs(bonusQty);
      await updateReportInHandAfterSale(productName, -returnQty, 0);
    } else if (isExchange && isIncoming) {
      await updateReportInHandAfterSale(productName, -Math.abs(totalQty), 0);
    } else if (isExchange && !isIncoming) {
      await updateReportInHandAfterSale(productName, Math.abs(totalQty), 0);
    } else {
      await updateReportInHandAfterSale(productName, salesQty, bonusQty);
    }
  } catch (error) {
    console.error(`Error restoring inventory for "${productName}":`, error.message);
    throw error;
  }
};

const getOrCreateCustomer = async (customerData) => {
  try {
    if (customerData.customerId) {
      const customer = await Customer.findById(customerData.customerId);
      if (customer) {
        return {
          customerId: customer._id,
          customerName: customer.name || customerData.customerName,
          customerCode: customer.customerCode || customerData.customerCode,
        };
      }
    }
    if (customerData.customerName) {
      const customer = await Customer.findOne({
        name: { $regex: new RegExp(customerData.customerName, "i") },
      });
      if (customer) {
        return {
          customerId: customer._id,
          customerName: customer.name,
          customerCode: customer.customerCode,
        };
      }
    }
    if (customerData.customerCode) {
      const customer = await Customer.findOne({ customerCode: customerData.customerCode });
      if (customer) {
        return {
          customerId: customer._id,
          customerName: customer.name,
          customerCode: customer.customerCode,
        };
      }
    }
    const defaultCustomer = await Customer.findOneAndUpdate(
      { name: "Default Customer" },
      {
        $setOnInsert: {
          name: "Default Customer",
          customerCode: "DEFAULT001",
          customerNumber: "000000",
          address: "Default Address",
          zone: "Default Zone",
          phone: "000-000-0000",
          email: "default@example.com",
        },
      },
      { upsert: true, new: true }
    );
    return {
      customerId: defaultCustomer._id,
      customerName: defaultCustomer.name,
      customerCode: defaultCustomer.customerCode,
    };
  } catch (error) {
    console.error("getOrCreateCustomer error:", error);
    return {
      customerId: null,
      customerName: customerData.customerName || "Unknown Customer",
      customerCode: customerData.customerCode || "",
    };
  }
};














export { router as saleRouter };
export default router;