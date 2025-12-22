import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import PaymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
import ExcelJS from "exceljs";
import SalesReturn from "../../models/sale/saleReturn.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Customer from "../../models/master/customer.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js"; // Added Staff import
import mongoose from "mongoose";

const router = express.Router();

let importProgressMap = new Map(); // Store progress per session

const createSessionId = () =>
  `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 🔥 ENHANCED: Better product name normalization
const normalizeProductName = (name) => {
  if (!name) return "";

  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .replace(/[^a-z0-9\s]/g, "") // Remove special characters
    .trim();
};

// 🔥 CORRECTED: Function to add cash to MR for cash/paid sales
const addCashToMR = async (saleData, existingCashAmount = 0) => {
  try {
    const {
      mrName,
      mrId,
      paidAmount,
      invoiceNumber,
      invoiceDate,
      customerName,
      paymentStatus,
      recordingDate,
    } = saleData;

    console.log(`💰 Attempting to add cash to MR for invoice ${invoiceNumber}`);
    console.log(`MR Name: ${mrName}, MR ID: ${mrId}, Amount: $${paidAmount}`);

    // Only add to MR cash if payment is Cash or Paid and has positive paid amount
    if (
      (paymentStatus === "Cash" || paymentStatus === "Paid") &&
      paidAmount > 0
    ) {
      // First, try to find the MR (staff member) by name or ID
      let mrStaff = null;

      if (mrId) {
        mrStaff = await Staff.findById(mrId);
        console.log(`Found MR by ID: ${mrId}, Name: ${mrStaff?.name || 'Not found'}`);
      }

      if (!mrStaff && mrName) {
        // Try to find by name
        mrStaff = await Staff.findOne({
          $or: [
            { name: { $regex: new RegExp(mrName.trim(), "i") } },
            { email: { $regex: new RegExp(mrName.trim(), "i") } },
          ],
        });
        console.log(`Found MR by name "${mrName}": ${mrStaff?.name || 'Not found'}`);
      }

      if (!mrStaff) {
        console.log(`⚠️ MR not found: ${mrName}, cash will not be recorded`);
        return { success: false, reason: "MR not found" };
      }

      console.log(`✅ MR found: ${mrStaff.name}, ID: ${mrStaff._id}`);

      // Find or create MR cash record
      let mrCash = await MRCash.findOne({ mrId: mrStaff._id });
      console.log(`MRCASH record found: ${mrCash ? 'Yes' : 'No'}`);

      const cashDate = invoiceDate || new Date();

      if (!mrCash) {
        // Create new MR cash record
        mrCash = new MRCash({
          mrId: mrStaff._id,
          mrName: mrStaff.name || mrName.trim(),
          currentCash: parseFloat(paidAmount) || 0,
          cashTransferredToAdmin: 0,
          lastTransferDate: null,
          notes: `Initial cash from sale invoice ${invoiceNumber}`,
          isActive: true,
        });
        await mrCash.save();
        console.log(
          `💰 Created new cash record for MR ${
            mrStaff.name || mrName
          }: $${paidAmount}, ID: ${mrCash._id}`
        );
      } else {
        // Update existing MR cash record
        const currentTotal = parseFloat(mrCash.currentCash) || 0;
        const newAmount = parseFloat(paidAmount) || 0;

        // If editing and we have existing cash amount, adjust accordingly
        let netAmount = newAmount;
        if (existingCashAmount > 0) {
          netAmount = newAmount - existingCashAmount;
        }

        mrCash.currentCash = currentTotal + netAmount;

        // Add note about the transaction
        mrCash.notes = `Added $${netAmount} from sale invoice ${invoiceNumber} (customer: ${
          customerName || "Unknown"
        })`;

        mrCash.updatedAt = new Date();
        await mrCash.save();
        console.log(
          `💰 Updated cash for MR ${
            mrStaff.name || mrName
          }: Added $${netAmount} (Total: $${mrCash.currentCash})`
        );
      }

      return {
        success: true,
        mrName: mrStaff.name || mrName,
        mrId: mrStaff._id,
        amountAdded: parseFloat(paidAmount) || 0,
        currentCash: mrCash.currentCash,
      };
    }

    console.log(`ℹ️ Not a cash/paid sale or zero amount: ${paymentStatus}, $${paidAmount}`);
    return { success: false, reason: "Not a cash/paid sale or zero amount" };
  } catch (error) {
    console.error("❌ Error adding cash to MR:", error);
    throw error;
  }
};

// 🔥 CORRECTED: Function to remove cash from MR (for returns/edits/deletes)
const removeCashFromMR = async (saleData) => {
  try {
    const { mrName, mrId, paidAmount, invoiceNumber } = saleData;

    console.log(`💰 Attempting to remove cash from MR for invoice ${invoiceNumber}`);
    console.log(`MR Name: ${mrName}, MR ID: ${mrId}, Amount: $${paidAmount}`);

    // Only remove if there was cash involved
    if (
      (saleData.paymentStatus === "Cash" ||
        saleData.paymentStatus === "Paid") &&
      paidAmount > 0
    ) {
      // Try to find MR first
      let mrStaff = null;

      if (mrId) {
        mrStaff = await Staff.findById(mrId);
        console.log(`Found MR by ID: ${mrId}, Name: ${mrStaff?.name || 'Not found'}`);
      }

      if (!mrStaff && mrName) {
        mrStaff = await Staff.findOne({
          $or: [
            { name: { $regex: new RegExp(mrName.trim(), "i") } },
            { email: { $regex: new RegExp(mrName.trim(), "i") } },
          ],
        });
        console.log(`Found MR by name "${mrName}": ${mrStaff?.name || 'Not found'}`);
      }

      if (!mrStaff) {
        console.log(`⚠️ MR not found for cash removal: ${mrName}`);
        return { success: false, reason: "MR not found" };
      }

      const mrCash = await MRCash.findOne({ mrId: mrStaff._id });
      console.log(`MRCASH record found: ${mrCash ? 'Yes' : 'No'}`);

      if (mrCash) {
        const removeAmount = parseFloat(paidAmount) || 0;
        mrCash.currentCash = Math.max(
          0,
          (parseFloat(mrCash.currentCash) || 0) - removeAmount
        );

        // Add note about the removal
        mrCash.notes = `Removed $${removeAmount} due to sale deletion/return (invoice: ${invoiceNumber})`;

        mrCash.updatedAt = new Date();
        await mrCash.save();
        console.log(
          `💰 Removed cash for MR ${
            mrStaff.name || mrName
          }: Deducted $${removeAmount} (Total: $${mrCash.currentCash})`
        );

        return {
          success: true,
          mrName: mrStaff.name || mrName,
          amountRemoved: removeAmount,
          currentCash: mrCash.currentCash,
        };
      } else {
        console.log(
          `⚠️ No cash record found for MR: ${mrStaff.name || mrName}`
        );
        return { success: false, reason: "No cash record found" };
      }
    }

    console.log(`ℹ️ No cash to remove: ${saleData.paymentStatus}, $${paidAmount}`);
    return { success: false, reason: "No cash to remove" };
  } catch (error) {
    console.error("❌ Error removing cash from MR:", error);
    throw error;
  }
};

const productNameFixMap = {
  // Existing mappings
  "n-lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n-lycopene+wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n-lycopene +wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n-lycopene+ wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
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
  "n sea buckthorn & oil lutein extract":
    "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",
  "sea buckthorn & oil lutein extract": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",

  // 🔥 NEW: ECOMOL variations
  "ecomol 500": "ECOMOL 500",
  ecomol500: "ECOMOL 500",
  "ecomol-500": "ECOMOL 500",
  ecomol: "ECOMOL 500",

  // 🔥 NEW: General pattern for products with numbers
  "500mg": "500 MG",
  "500 mg": "500 MG",
  500: "500 MG",
};

// 🔥 NEW: Function to remove all spaces and special characters for comparison
const getStrictNormalizedProductName = (name) => {
  if (!name) return "";

  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // Remove all non-alphanumeric characters
    .trim();
};

// 🔥 ENHANCED: Find product in inventory with better matching
const findProductInInventory = async (productName) => {
  try {
    const normalizedProductName = normalizeProductName(productName);
    const strictNormalizedProductName =
      getStrictNormalizedProductName(productName);

    // First, check the fix map
    const fixedProductName =
      productNameFixMap[normalizedProductName] ||
      productNameFixMap[strictNormalizedProductName];

    if (fixedProductName) {
      // Try exact match with the fixed name
      const exactMatchWithFixed = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${fixedProductName}$`, "i") },
      });

      if (exactMatchWithFixed) {
        return exactMatchWithFixed;
      }
    }

    // 🔥 NEW: Get all products from inventory for better matching
    const allProducts = await ReportInHand.find({});

    // 🔥 NEW: Try multiple matching strategies
    for (const product of allProducts) {
      const inventoryNormalized = normalizeProductName(product.productName);
      const inventoryStrict = getStrictNormalizedProductName(
        product.productName
      );

      // Strategy 1: Exact match (case-insensitive)
      if (product.productName.toLowerCase() === productName.toLowerCase()) {
        return product;
      }

      // Strategy 2: Normalized match
      if (inventoryNormalized === normalizedProductName) {
        return product;
      }

      // Strategy 3: Strict normalized match (remove all non-alphanumeric)
      if (inventoryStrict === strictNormalizedProductName) {
        return product;
      }

      // Strategy 4: Contains match
      if (
        product.productName.toLowerCase().includes(productName.toLowerCase()) ||
        productName.toLowerCase().includes(product.productName.toLowerCase())
      ) {
        return product;
      }

      // Strategy 5: Handle ECOMOL specifically
      if (
        productName.toLowerCase().includes("ecomol") &&
        product.productName.toLowerCase().includes("ecomol")
      ) {
        // Extract numbers from both names
        const inputNumber = productName.replace(/\D/g, "") || "500";
        const productNumber = product.productName.replace(/\D/g, "") || "500";

        if (inputNumber === productNumber) {
          return product;
        }
      }
    }

    // 🔥 NEW: Try fuzzy matching for common product patterns
    const searchTerm = productName.toLowerCase();

    for (const product of allProducts) {
      const productTerm = product.productName.toLowerCase();

      // Check for common patterns
      if (productTerm.includes("ecomol") && searchTerm.includes("ecomol")) {
        return product;
      }

      // Check for same base name with different numbers
      const baseName = searchTerm.replace(/\d+/g, "").trim();
      const productBaseName = productTerm.replace(/\d+/g, "").trim();

      if (baseName === productBaseName && baseName.length > 3) {
        return product;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error finding product "${productName}":`, error);
    return null;
  }
};

const mapPaymentStatus = (status) => {
  if (!status) return "Credit";

  const statusLower = status.toLowerCase().trim();
  const statusMapping = {
    paid: "Cash",
    pending: "Credit",
    credit: "Credit",
    cash: "Cash",
    "partial paid": "Partial Paid",
    partial: "Partial Paid",
    return: "Return",
    returns: "Return",
    RETURN: "Return",
    RETURNS: "Return",
  };

  return statusMapping[statusLower] || "Credit";
};

const parseDateString = (dateStr) => {
  if (!dateStr) return null;

  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate)) return isoDate;

  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const formatted = new Date(`${year}-${month}-${day}`);
    if (!isNaN(formatted)) return formatted;
  }

  return null;
};

const isReturnTransaction = (remark, paymentStatus) => {
  if (!remark && !paymentStatus) return false;

  const remarkLower = remark ? remark.toLowerCase().trim() : "";
  const statusLower = paymentStatus ? paymentStatus.toLowerCase().trim() : "";

  // Check if remark contains return/returns or payment status is return
  const returnKeywords = ["return", "returns", "RETURN", "RETURNS"];
  const hasReturnKeyword = returnKeywords.some(
    (keyword) => remarkLower.includes(keyword) || statusLower.includes(keyword)
  );
  const isReturnStatus = statusLower === "return" || statusLower === "returns";

  return hasReturnKeyword || isReturnStatus;
};

const updateReportInHandAfterSale = async (productName, salesQty, bonusQty) => {
  try {
    const totalQtyToUpdate = salesQty + bonusQty;

    if (totalQtyToUpdate <= 0) {
      return 0;
    }

    // 🔥 FIXED: Use enhanced product finder
    const existingProduct = await findProductInInventory(productName);

    if (!existingProduct) {
      // Try alternative product name formats
      const altNames = [
        productName.replace(/\+/g, " + "),
        productName.replace(/\+/g, "+"),
        productName.replace(/\s+/g, " "),
        productName.replace(/N-/g, "").trim(),
        "N-" + productName.replace(/N-/g, "").trim(),
      ];

      for (const altName of altNames) {
        if (altName !== productName) {
          const altProduct = await findProductInInventory(altName);
          if (altProduct) {
            return await updateReportInHandAfterSale(
              altProduct.productName,
              salesQty,
              bonusQty
            );
          }
        }
      }

      // Log available products for debugging
      const allProducts = await ReportInHand.find({});
      const availableProducts = allProducts.map((p) => p.productName);

      throw new Error(
        `Product "${productName}" not found in inventory. Available products: ${availableProducts.join(
          ", "
        )}`
      );
    }

    let currentStock = 0;
    let lcValue = 0;

    // Real ReportInHand document
    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      currentStock = existingProduct.batches.reduce(
        (total, batch) => total + (batch.boxes || 0),
        0
      );
      lcValue = existingProduct.batches[0].lc || 0;
    } else if (existingProduct.totalBoxes !== undefined) {
      currentStock = existingProduct.totalBoxes;
      lcValue = existingProduct.lc || 0;
    } else if (existingProduct.currentStock !== undefined) {
      currentStock = existingProduct.currentStock;
      lcValue = existingProduct.lc || 0;
    } else {
      currentStock = existingProduct.boxes || 0;
      lcValue = existingProduct.lc || 0;
    }

    // Check stock for regular sales (must have positive quantity)
    if (currentStock < totalQtyToUpdate) {
      throw new Error(
        `Insufficient stock for "${existingProduct.productName}". Available: ${currentStock}, Required: ${totalQtyToUpdate}`
      );
    }

    let updatedStock = currentStock - totalQtyToUpdate;

    // Update logic
    let updateFields = {};
    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      const updatedBatches = [...existingProduct.batches];

      // Deduct from inventory for regular sales
      let remainingDeduction = totalQtyToUpdate;
      for (
        let i = 0;
        i < updatedBatches.length && remainingDeduction > 0;
        i++
      ) {
        if (updatedBatches[i].boxes >= remainingDeduction) {
          updatedBatches[i].boxes -= remainingDeduction;
          remainingDeduction = 0;
        } else {
          remainingDeduction -= updatedBatches[i].boxes;
          updatedBatches[i].boxes = 0;
        }
      }

      updateFields = { batches: updatedBatches };

      if (existingProduct.totalBoxes !== undefined) {
        updateFields.totalBoxes = updatedStock;
      }
    } else if (existingProduct.totalBoxes !== undefined) {
      updateFields = { totalBoxes: updatedStock };
    } else if (existingProduct.currentStock !== undefined) {
      updateFields = { currentStock: updatedStock };
    } else {
      updateFields = { boxes: updatedStock };
    }

    let updatedStatus = "In Stock";
    if (updatedStock === 0) updatedStatus = "Out of Stock";
    else if (updatedStock < 5) updatedStatus = "Critical";
    else if (updatedStock < 15) updatedStatus = "Low Stock";

    updateFields.status = updatedStatus;

    await ReportInHand.findByIdAndUpdate(existingProduct._id, {
      $set: updateFields,
    });

    return lcValue;
  } catch (error) {
    console.error(
      `❌ Error updating ReportInHand for product "${productName}":`,
      error.message
    );
    throw error;
  }
};

const updateInventoryForExchange = async (
  productName,
  salesQty,
  bonusQty,
  isIncoming = false
) => {
  try {
    const totalQty = salesQty + bonusQty;
    if (totalQty === 0) {
      return 0; // Zero quantity lines are informational only
    }

    // 🔥 FIXED: Use enhanced product finder
    const existingProduct = await findProductInInventory(productName);

    if (!existingProduct) {
      throw new Error(`Product "${productName}" not found in inventory.`);
    }

    let currentStock = 0;
    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      currentStock = existingProduct.batches.reduce(
        (total, batch) => total + (batch.boxes || 0),
        0
      );
    } else if (existingProduct.totalBoxes !== undefined) {
      currentStock = existingProduct.totalBoxes;
    } else if (existingProduct.currentStock !== undefined) {
      currentStock = existingProduct.currentStock;
    } else {
      currentStock = existingProduct.boxes || 0;
    }

    let updatedStock;

    if (isIncoming) {
      // For incoming products in exchange (negative quantity)
      updatedStock = currentStock + Math.abs(totalQty);
    } else {
      // For outgoing products in exchange (positive quantity)
      if (currentStock < Math.abs(totalQty)) {
        throw new Error(
          `Insufficient stock for exchange: "${
            existingProduct.productName
          }". Available: ${currentStock}, Required: ${Math.abs(totalQty)}`
        );
      }
      updatedStock = currentStock - Math.abs(totalQty);
    }

    let updateFields = {};
    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      const updatedBatches = [...existingProduct.batches];

      if (updatedBatches[0].boxes !== undefined) {
        if (isIncoming) {
          updatedBatches[0].boxes += Math.abs(totalQty);
        } else {
          let remainingDeduction = Math.abs(totalQty);
          for (
            let i = 0;
            i < updatedBatches.length && remainingDeduction > 0;
            i++
          ) {
            if (updatedBatches[i].boxes >= remainingDeduction) {
              updatedBatches[i].boxes -= remainingDeduction;
              remainingDeduction = 0;
            } else {
              remainingDeduction -= updatedBatches[i].boxes;
              updatedBatches[i].boxes = 0;
            }
          }
        }
      }

      updateFields = { batches: updatedBatches };

      if (existingProduct.totalBoxes !== undefined) {
        updateFields.totalBoxes = updatedStock;
      }
    } else if (existingProduct.totalBoxes !== undefined) {
      updateFields = { totalBoxes: updatedStock };
    } else if (existingProduct.currentStock !== undefined) {
      updateFields = { currentStock: updatedStock };
    } else {
      updateFields = { boxes: updatedStock };
    }

    let updatedStatus = "In Stock";
    if (updatedStock === 0) updatedStatus = "Out of Stock";
    else if (updatedStock < 5) updatedStatus = "Critical";
    else if (updatedStock < 15) updatedStatus = "Low Stock";

    updateFields.status = updatedStatus;

    await ReportInHand.findByIdAndUpdate(existingProduct._id, {
      $set: updateFields,
    });

    let lcValue = 0;
    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      lcValue = existingProduct.batches[0].lc || 0;
    } else {
      lcValue = existingProduct.lc || 0;
    }

    return lcValue;
  } catch (error) {
    console.error(
      `❌ Error updating inventory for exchange product "${productName}":`,
      error.message
    );
    throw error;
  }
};

// 🔥 MODIFIED: CORRECTED DELETE RESTORE FUNCTION WITH RETURN/EXCHANGE SUPPORT
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
    const isIncoming = totalQty < 0; // Negative quantity means it was incoming to inventory

    if (isReturn) {
      // For returns, we added to inventory, so now we need to deduct
      const returnQty = Math.abs(salesQty) + Math.abs(bonusQty);
      await updateReportInHandAfterSale(
        productName,
        -returnQty, // Negative to deduct
        0
      );
    } else if (isExchange && isIncoming) {
      // For exchange incoming, we added to inventory, now deduct
      await updateReportInHandAfterSale(productName, -Math.abs(totalQty), 0);
    } else if (isExchange && !isIncoming) {
      // For exchange outgoing, we deducted from inventory, now add back
      await updateReportInHandAfterSale(productName, Math.abs(totalQty), 0);
    } else {
      // For regular sales, restore inventory
      await updateReportInHandAfterSale(productName, salesQty, bonusQty);
    }
  } catch (error) {
    console.error(
      `❌ Error restoring ReportInHand for product "${productName}":`,
      error.message
    );
    throw error;
  }
};

// 🔥 NEW: Handle missing customerId by creating a default customer
const getOrCreateCustomer = async (customerData) => {
  try {
    // If customerId is provided, try to find the customer
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

    // If customerName is provided, try to find by name
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

    // If customerCode is provided, try to find by code
    if (customerData.customerCode) {
      const customer = await Customer.findOne({
        customerCode: customerData.customerCode,
      });
      if (customer) {
        return {
          customerId: customer._id,
          customerName: customer.name,
          customerCode: customer.customerCode,
        };
      }
    }

    // Create a default customer if none found
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
    console.error("Error in getOrCreateCustomer:", error);
    return {
      customerId: null,
      customerName: customerData.customerName || "Unknown Customer",
      customerCode: customerData.customerCode || "",
    };
  }
};

// 🔥 FIXED: Added missing function to check invoice number existence
const checkInvoiceNumberExists = async (invoiceNumber, excludeId = null) => {
  const query = { invoiceNumber: invoiceNumber };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existingSale = await SaleSummary.findOne(query);
  return !!existingSale;
};

// 🔥 NEW: Function to parse quantity with parenthesis support
const parseQuantityWithParenthesis = (quantity) => {
  if (quantity === null || quantity === undefined || quantity === "") {
    return 0;
  }

  // If it's already a number
  if (typeof quantity === "number") {
    return quantity;
  }

  // If it's a string
  if (typeof quantity === "string") {
    const str = quantity.trim();

    // Check for parenthesis format like (10)
    const parenthesisMatch = str.match(/^\((\d+\.?\d*)\)$/);
    if (parenthesisMatch) {
      // Negative for returns
      return -parseFloat(parenthesisMatch[1]);
    }

    // Check for negative numbers
    if (str.startsWith("-")) {
      return parseFloat(str);
    }

    // Regular positive number
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }

  return 0;
};


// 🔥 FIXED: CRITICAL FIX - Update the processImportBatch function
const processImportBatch = async (
  batch,
  batchIndex,
  totalBatches,
  sessionId
) => {
  // Get progress for this session
  const importProgress = importProgressMap.get(sessionId);
  if (!importProgress) {
    throw new Error(`Import progress not found for session: ${sessionId}`);
  }

  const batchResults = {
    success: 0,
    failed: 0,
    errors: [],
    inventoryUpdates: [],
    cashUpdates: [],
    batchIndex,
    totalBatches,
  };

  // Update progress - start of batch
  importProgress.currentBatch = batchIndex + 1;
  importProgress.currentBatchProgress = 0;
  importProgress.processedInCurrentBatch = 0;
  importProgress.lastUpdated = Date.now();

  // Process each sale in the batch
  for (let i = 0; i < batch.length; i++) {
    const saleData = batch[i];
    const globalIndex = importProgress.processedInvoices + i + 1;

    try {
      // Update progress for each record
      importProgress.currentBatchProgress = Math.round(
        ((i + 1) / batch.length) * 100
      );
      importProgress.processedInCurrentBatch = i + 1;
      importProgress.lastUpdated = Date.now();

      console.log(`\n🔵 Processing invoice ${i + 1}: ${saleData.invoiceNumber}`);

      // Basic validation
      if (!saleData.invoiceNumber || saleData.invoiceNumber.trim() === "") {
        throw new Error("Invoice number is missing");
      }

      if (!Array.isArray(saleData.products) || saleData.products.length === 0) {
        throw new Error("No products found");
      }

      // 🔥 FIX: Ensure mrName has a default value
      if (!saleData.mrName || saleData.mrName.trim() === "") {
        saleData.mrName = "No MR Name Provided";
      }

      // Check duplicate invoice number
      const exists = await SaleSummary.findOne({
        invoiceNumber: saleData.invoiceNumber,
      });
      if (exists) {
        throw new Error(
          `Invoice number ${saleData.invoiceNumber} already exists`
        );
      }

      // Get or create customer
      let customerInfo;
      try {
        customerInfo = await getOrCreateCustomer({
          customerId: saleData.customerId,
          customerName: saleData.customerName,
          customerCode: saleData.customerCode,
        });
      } catch (customerError) {
        console.error(
          `Customer error for invoice ${saleData.invoiceNumber}:`,
          customerError.message
        );
        // Use default customer
        customerInfo = {
          customerId: new mongoose.Types.ObjectId(),
          customerName: saleData.customerName || "Unknown Customer",
          customerCode: saleData.customerCode || "UNKNOWN",
        };
      }

      console.log(`Customer: ${customerInfo.customerName}`);

      // Determine transaction type
      const isReturn = isReturnTransaction(
        saleData.remark,
        saleData.paymentStatus
      );
      const isExchange =
        saleData.remark?.toLowerCase().includes("exchange") ||
        (Array.isArray(saleData.products) &&
          saleData.products.some((p) =>
            (p.remark || "").toLowerCase().includes("exchange")
          ));

      console.log(`Transaction Type - Return: ${isReturn}, Exchange: ${isExchange}`);

      // Process products and calculate totals
      const processedProducts = [];
      let totalAmount = 0;

      for (const product of saleData.products) {
        const salesQty = parseQuantityWithParenthesis(product.salesQty);
        const bonusQty = parseQuantityWithParenthesis(product.bonusQty) || 0;
        const totalQty = salesQty + bonusQty;

        if (totalQty === 0) {
          continue; // Skip zero quantity products
        }

        // Find product in inventory
        const existingProduct = await findProductInInventory(
          product.productName
        );

        if (!existingProduct) {
          throw new Error(
            `Product "${product.productName}" not found in inventory`
          );
        }

        console.log(`✓ Product found: ${product.productName} -> ${existingProduct.productName}`);

        let lcValue = 0;
        let actualProductName = existingProduct.productName;

        if (existingProduct) {
          lcValue = existingProduct.lc || existingProduct.batches?.[0]?.lc || 0;
        }

        // Update inventory based on transaction type
        if (isReturn) {
          // Returns add stock back to inventory
          await updateReportInHandAfterSale(
            actualProductName,
            -Math.abs(salesQty),
            -Math.abs(bonusQty)
          );
        } else if (isExchange && totalQty < 0) {
          // Exchange incoming (negative quantity) - add to inventory
          await updateInventoryForExchange(
            actualProductName,
            salesQty,
            bonusQty,
            true
          );
        } else if (isExchange && totalQty > 0) {
          // Exchange outgoing (positive quantity) - deduct from inventory
          await updateInventoryForExchange(
            actualProductName,
            salesQty,
            bonusQty,
            false
          );
        } else {
          // Regular sale - deduct from inventory
          await updateReportInHandAfterSale(
            actualProductName,
            salesQty,
            bonusQty
          );
        }

        // Calculate profit/loss
        const netSellingAmount = Number(product.netSellingAmount) || 0;
        const profitLoss =
          (isReturn ? -1 : 1) *
          (netSellingAmount - Math.abs(totalQty) * lcValue);

        processedProducts.push({
          productName: actualProductName,
          originalProductName: product.productName,
          salesQty: salesQty,
          bonusQty: bonusQty,
          totalQty: totalQty,
          sellingPrice: Number(product.sellingPrice) || 0,
          amount: Number(product.amount) || 0,
          discount: Number(product.discount) || 0,
          netSellingAmount: netSellingAmount,
          averageUnitPrice: Number(product.averageUnitPrice) || 0,
          lc: lcValue,
          profitLoss: profitLoss,
          isProductAccept:
            product.isProductAccept !== undefined
              ? product.isProductAccept
              : true,
          isExchangeProduct: isExchange,
          isReturnProduct: isReturn,
        });

        totalAmount += netSellingAmount;
      }

      if (processedProducts.length === 0) {
        throw new Error("No valid products to import");
      }

      // Calculate totals
      const paidAmount = Number(saleData.paidAmount) || 0;
      const dueAmount = totalAmount - paidAmount;

      // Find MR (staff)
      let mrStaff = null;
      if (saleData.mrName && saleData.mrName.trim() !== "No MR Name Provided") {
        mrStaff = await Staff.findOne({
          $or: [
            { name: { $regex: new RegExp(saleData.mrName.trim(), "i") } },
            { email: { $regex: new RegExp(saleData.mrName.trim(), "i") } },
          ],
        });

        if (mrStaff) {
          console.log(`✅ MR found: ${mrStaff.name}, ID: ${mrStaff._id}`);
        } else {
          console.log(`⚠️ MR not found by name: ${saleData.mrName}`);
        }
      }

      // Parse dates
      const recordingDate =
        parseDateString(saleData.recordingDate) || new Date();
      const invoiceDate = parseDateString(saleData.invoiceDate) || new Date();
      const dueDate = saleData.dueDate
        ? parseDateString(saleData.dueDate)
        : null;
      const deliveryDate = parseDateString(saleData.deliveryDate) || new Date();

      // 🔥 CRITICAL FIX: Create the sale record with proper data
      const newSaleData = {
        recordingDate: recordingDate,
        invoiceNumber: saleData.invoiceNumber.toString().trim(),
        invoiceDate: invoiceDate,
        mrName: saleData.mrName || "No MR Name Provided",
        mrId: mrStaff ? mrStaff._id : null,
        customerName: customerInfo.customerName,
        customerCode: customerInfo.customerCode,
        customerId: customerInfo.customerId,
        products: processedProducts,
        creditDays: saleData.creditDays ? Number(saleData.creditDays) : 0,
        dueDate: dueDate,
        deliveryDate: deliveryDate,
        paidAmount: paidAmount,
        dueAmount: dueAmount,
        totalAmount: totalAmount,
        paymentStatus: mapPaymentStatus(saleData.paymentStatus),
        remark: saleData.remark || "",
        importBatchId: batchIndex,
        importStatus: "imported",
        isExchange: isExchange,
        isReturn: isReturn,
      };

      console.log("Creating sale with data:", {
        invoiceNumber: newSaleData.invoiceNumber,
        customerName: newSaleData.customerName,
        productCount: newSaleData.products.length,
        totalAmount: newSaleData.totalAmount,
        paymentStatus: newSaleData.paymentStatus,
        paidAmount: newSaleData.paidAmount,
      });

      // Save to database
      const newSale = new SaleSummary(newSaleData);
      await newSale.save();

      console.log(`✅ Successfully saved sale: ${newSale.invoiceNumber}, ID: ${newSale._id}`);

      // Handle MR cash if payment is Cash/Paid
      if (
        (newSale.paymentStatus === "Cash" ||
          newSale.paymentStatus === "Paid") &&
        newSale.paidAmount > 0
      ) {
        try {
          const cashResult = await addCashToMR({
            mrName: newSale.mrName,
            mrId: mrStaff ? mrStaff._id : null,
            paidAmount: newSale.paidAmount,
            invoiceNumber: newSale.invoiceNumber,
            invoiceDate: newSale.invoiceDate,
            customerName: newSale.customerName,
            paymentStatus: newSale.paymentStatus,
            recordingDate: newSale.recordingDate,
          });

          if (cashResult.success) {
            batchResults.cashUpdates.push({
              invoiceNumber: newSale.invoiceNumber,
              mrName: newSale.mrName,
              amount: newSale.paidAmount,
              status: "added_to_mr_cash",
            });
            console.log(`💰 Cash added to MR: $${newSale.paidAmount}`);
          } else {
            console.log(`⚠️ Cash not added: ${cashResult.reason}`);
          }
        } catch (cashError) {
          console.error(`⚠️ Failed to add cash to MR: ${cashError.message}`);
        }
      }

      batchResults.success++;
      importProgress.successful++;
      importProgress.processedInvoices++;
      importProgress.lastUpdated = Date.now();

    } catch (error) {
      console.error(
        `❌ Failed to import invoice ${saleData.invoiceNumber || "Unknown"}:`,
        error.message
      );

      batchResults.failed++;
      batchResults.errors.push({
        index: globalIndex - 1,
        invoiceNumber: saleData.invoiceNumber || `Row-${globalIndex}`,
        customerName: saleData.customerName || "Unknown",
        error: error.message,
        type: "import_error",
        timestamp: new Date().toISOString(),
      });

      importProgress.failed++;
      importProgress.processedInvoices++;
      importProgress.lastUpdated = Date.now();
    }
  }

  // Final batch progress
  importProgress.currentBatchProgress = 100;
  importProgressMap.set(sessionId, importProgress);

  return batchResults;
};
// Debug endpoint to check database status
router.get("/debug/database-status", async (req, res) => {
  try {
    // Check connection
    const dbStatus = mongoose.connection.readyState;
    const dbStates = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    // Get collection counts
    const saleCount = await SaleSummary.countDocuments();
    const mrcashCount = await MRCash.countDocuments();
    const staffCount = await Staff.countDocuments();
    const customerCount = await Customer.countDocuments();

    // Get sample data
    const sampleSale = await SaleSummary.findOne().sort({ createdAt: -1 });
    const sampleMRCASH = await MRCash.findOne().sort({ createdAt: -1 });

    // Check indexes
    const saleIndexes = await SaleSummary.collection.indexes();
    const mrcashIndexes = await MRCash.collection.indexes();

    res.json({
      success: true,
      database: {
        status: dbStates[dbStatus],
        name: mongoose.connection.name,
        host: mongoose.connection.host,
      },
      collections: {
        SaleSummary: {
          count: saleCount,
          collectionName: SaleSummary.collection.name,
        },
        MRCash: {
          count: mrcashCount,
          collectionName: MRCash.collection.name,
        },
        Staff: { count: staffCount },
        Customer: { count: customerCount },
      },
      sampleData: {
        latestSale: sampleSale
          ? {
              _id: sampleSale._id,
              invoiceNumber: sampleSale.invoiceNumber,
              mrName: sampleSale.mrName,
              mrId: sampleSale.mrId,
              paymentStatus: sampleSale.paymentStatus,
              paidAmount: sampleSale.paidAmount,
              createdAt: sampleSale.createdAt,
            }
          : null,
        latestMRCASH: sampleMRCASH
          ? {
              _id: sampleMRCASH._id,
              mrName: sampleMRCASH.mrName,
              mrId: sampleMRCASH.mrId,
              currentCash: sampleMRCASH.currentCash,
              createdAt: sampleMRCASH.createdAt,
            }
          : null,
      },
      indexes: {
        SaleSummary: saleIndexes.map(idx => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false,
        })),
        MRCash: mrcashIndexes.map(idx => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false,
        })),
      },
    });
  } catch (error) {
    console.error("Database status error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
});

// Test endpoint to create a test sale with MR cash
router.post("/debug/test-sale-with-cash", async (req, res) => {
  try {
    // Create test data
    const testSaleData = {
      recordingDate: new Date().toISOString().split("T")[0],
      invoiceNumber: `TEST-CASH-${Date.now()}`,
      invoiceDate: new Date().toISOString().split("T")[0],
      mrName: "Test MR",
      customerName: "Test Customer",
      customerCode: "TEST001",
      products: [
        {
          productName: "N-LYCOPENE + WHEATGERM OIL",
          salesQty: 5,
          bonusQty: 0,
          sellingPrice: 100,
          amount: 500,
          discount: 0,
          netSellingAmount: 500,
          averageUnitPrice: 100,
          lc: 50,
          profitLoss: 250,
          isProductAccept: true,
        },
      ],
      creditDays: 0,
      dueDate: new Date().toISOString().split("T")[0],
      deliveryDate: new Date().toISOString().split("T")[0],
      paidAmount: 500,
      dueAmount: 0,
      totalAmount: 500,
      paymentStatus: "Cash",
      remark: "Test cash sale",
    };

    // First check if MR exists
    let mrStaff = await Staff.findOne({ name: "Test MR" });
    if (!mrStaff) {
      // Create test MR if doesn't exist
      mrStaff = new Staff({
        name: "Test MR",
        email: `test.mr${Date.now()}@test.com`,
        role: "Medical Representative",
        isActive: true,
      });
      await mrStaff.save();
      console.log(`✅ Created test MR: ${mrStaff.name}, ID: ${mrStaff._id}`);
    }

    // Create sale
    const sale = new SaleSummary({
      ...testSaleData,
      mrId: mrStaff._id,
      customerId: new mongoose.Types.ObjectId(),
    });

    await sale.save();
    console.log(`✅ Created test sale: ${sale.invoiceNumber}, ID: ${sale._id}`);

    // Add cash to MR
    const cashResult = await addCashToMR({
      mrName: sale.mrName,
      mrId: sale.mrId,
      paidAmount: sale.paidAmount,
      invoiceNumber: sale.invoiceNumber,
      invoiceDate: sale.invoiceDate,
      customerName: sale.customerName,
      paymentStatus: sale.paymentStatus,
      recordingDate: sale.recordingDate,
    });

    // Verify cash was added
    const mrCashRecord = await MRCash.findOne({ mrId: mrStaff._id });
    
    res.json({
      success: true,
      message: "Test sale created",
      sale: {
        id: sale._id,
        invoiceNumber: sale.invoiceNumber,
        mrName: sale.mrName,
        mrId: sale.mrId,
        paidAmount: sale.paidAmount,
        paymentStatus: sale.paymentStatus,
      },
      cashResult,
      mrCashRecord: mrCashRecord ? {
        id: mrCashRecord._id,
        mrName: mrCashRecord.mrName,
        mrId: mrCashRecord.mrId,
        currentCash: mrCashRecord.currentCash,
        notes: mrCashRecord.notes,
      } : null,
    });
  } catch (error) {
    console.error("Test sale error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

const initializeImportProgress = (sessionId, totalInvoices, batchSize) => {
  importProgressMap.set(sessionId, {
    sessionId,
    totalBatches: Math.ceil(totalInvoices / batchSize),
    currentBatch: 0,
    processedInvoices: 0,
    totalInvoices,
    successful: 0,
    failed: 0,
    insufficientStockProducts: new Map(),
    errors: [],
    startTime: Date.now(),
    transactionTypes: { return: 0, exchange: 0, regular: 0 },
    currentBatchProgress: 0,
    processedInCurrentBatch: 0,
    progressPercentage: 0, // Overall progress
    lastUpdated: Date.now(),
    completed: false,
    errorTypes: {}, // Track types of errors
    estimatedTimeRemaining: null,
    cashSalesCount: 0,
    cashAmountAdded: 0,
    result: null,
  });

  return sessionId;
};

// 🔥 FIXED: Missing function - Add this after initializeImportProgress
const updateImportProgress = (sessionId, updates) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) {
    console.warn(`No progress found for session: ${sessionId}`);
    return;
  }

  // Update progress with new data
  Object.assign(progress, updates, {
    lastUpdated: Date.now(),
  });

  // Calculate progress percentage
  if (progress.totalInvoices > 0) {
    progress.progressPercentage = Math.round(
      (progress.processedInvoices / progress.totalInvoices) * 100
    );
  }

  importProgressMap.set(sessionId, progress);
};

const processImportAsync = async (sessionId, salesData, batchSize) => {
  let importedCount = 0;
  let failedCount = 0;
  let failedInvoices = [];
  let cashSalesCount = 0;
  let totalCashAdded = 0;

  try {
    const importProgress = importProgressMap.get(sessionId);
    if (!importProgress) {
      throw new Error("Import progress not initialized");
    }

    // Process in batches
    for (let i = 0; i < salesData.length; i += batchSize) {
      const batch = salesData.slice(i, i + batchSize);

      const batchResult = await processImportBatch(
        batch,
        Math.floor(i / batchSize),
        Math.ceil(salesData.length / batchSize),
        sessionId
      );

      importedCount += batchResult.success;
      failedCount += batchResult.failed;
      failedInvoices.push(...batchResult.errors);

      // Track cash sales from batch
      if (batchResult.cashUpdates && batchResult.cashUpdates.length > 0) {
        cashSalesCount += batchResult.cashUpdates.length;
        totalCashAdded += batchResult.cashUpdates.reduce(
          (sum, update) => sum + update.amount,
          0
        );
      }

      // Update progress after each batch
      const overallProgress = Math.round(
        (importProgress.processedInvoices / importProgress.totalInvoices) * 100
      );

      updateImportProgress(sessionId, {
        processedInvoices: importProgress.processedInvoices,
        progressPercentage: overallProgress,
        cashSalesCount: cashSalesCount,
        cashAmountAdded: totalCashAdded,
        successful: importedCount,
        failed: failedCount,
        transactionTypes: importProgress.transactionTypes || {
          return: 0,
          exchange: 0,
          regular: 0,
        },
      });
    }

    // Final progress update
    updateImportProgress(sessionId, {
      completed: true,
      result: {
        successfullyImported: importedCount,
        failed: failedCount,
        failedInvoices: failedInvoices,
        cashSales: cashSalesCount,
        cashAmount: totalCashAdded,
        summary: {
          total: salesData.length,
          successful: importedCount,
          failed: failedCount,
          regularTransactions:
            importedCount -
            (importProgress.transactionTypes?.return || 0) -
            (importProgress.transactionTypes?.exchange || 0),
          returnTransactions: importProgress.transactionTypes?.return || 0,
          exchangeTransactions: importProgress.transactionTypes?.exchange || 0,
          cashSales: cashSalesCount,
          cashAmount: totalCashAdded,
        },
      },
    });

    console.log(
      `🎉 Import completed: ${importedCount} successful, ${failedCount} failed`
    );
    if (cashSalesCount > 0) {
      console.log(
        `💰 ${cashSalesCount} cash sales added to MR accounts: $${totalCashAdded}`
      );
    }
  } catch (error) {
    console.error("🔥 Fatal error in import process:", error);
    updateImportProgress(sessionId, {
      completed: true,
      error: error.message,
      result: {
        successfullyImported: importedCount,
        failed: failedCount,
        failedInvoices: failedInvoices,
        cashSales: cashSalesCount,
        cashAmount: totalCashAdded,
      },
    });
  }
};

// 🔥 MODIFIED: VALIDATION FUNCTION WITH PARENTHESIS SUPPORT AND MR NAME FIX
const validateImportData = async (salesData) => {
  const errors = [];
  const validData = [];

  for (let i = 0; i < salesData.length; i++) {
    const sale = salesData[i];
    const saleErrors = [];

    // 🔥 FIX: Ensure mrName has a default value
    if (!sale.mrName || sale.mrName.trim() === "") {
      sale.mrName = "No MR Name Provided";
    }

    // Check for parenthesis quantities
    const hasParenthesisQuantity = sale.products?.some((product) => {
      const salesQtyStr = String(product.salesQty || "");
      return (
        salesQtyStr.trim().startsWith("(") && salesQtyStr.trim().endsWith(")")
      );
    });

    // Check if this is a return transaction
    const isReturn =
      isReturnTransaction(sale.remark, sale.paymentStatus) ||
      hasParenthesisQuantity;

    // Check for exchange
    const isExchange =
      sale.remark?.toLowerCase().includes("exchange") ||
      sale.products?.some((p) =>
        (p.remark || "").toLowerCase().includes("exchange")
      ) ||
      sale.isExchange;

    // 🔥 NEW REQUIREMENT: If quantity has parenthesis but remark doesn't have return/returns keywords
    if (hasParenthesisQuantity && !isReturn && !isExchange) {
      saleErrors.push(
        "Quantity in parenthesis found but remarks don't contain return/returns keywords"
      );
    }

    // Basic validation
    if (!sale.invoiceNumber || sale.invoiceNumber.trim() === "") {
      saleErrors.push("Invoice number is required");
    }

    if (!sale.customerName || sale.customerName.trim() === "") {
      saleErrors.push("Customer name is required");
    }

    if (!Array.isArray(sale.products) || sale.products.length === 0) {
      saleErrors.push("At least one product is required");
    }

    // Validate products
    if (Array.isArray(sale.products)) {
      sale.products.forEach((product, pIndex) => {
        if (!product.productName || product.productName.trim() === "") {
          saleErrors.push(`Product ${pIndex + 1}: Product name required`);
        }

        const salesQtyStr = String(product.salesQty || "");
        let salesQty;

        // Parse parenthesis quantities
        if (
          salesQtyStr.trim().startsWith("(") &&
          salesQtyStr.trim().endsWith(")")
        ) {
          const numStr = salesQtyStr.trim().slice(1, -1);
          salesQty = -Math.abs(parseFloat(numStr) || 0);
        } else {
          salesQty = parseFloat(product.salesQty);
        }

        const bonusQty = parseFloat(product.bonusQty) || 0;
        const totalQty = salesQty + bonusQty;

        // Different validation rules for different transaction types
        if (isReturn) {
          // Returns can have negative quantities (from parenthesis or negative numbers)
          if (isNaN(salesQty)) {
            saleErrors.push(
              `Product ${pIndex + 1}: Valid sales quantity required`
            );
          }
        } else if (isExchange) {
          // Exchanges can have positive, negative, or zero quantities
          if (isNaN(salesQty)) {
            saleErrors.push(
              `Product ${pIndex + 1}: Valid sales quantity required`
            );
          }
        } else {
          // Regular sales must have positive quantities
          if (isNaN(salesQty) || salesQty <= 0) {
            saleErrors.push(
              `Product ${
                pIndex + 1
              }: Valid sales quantity required (must be > 0)`
            );
          }
        }

        const sellingPrice = Number(product.sellingPrice);
        if (isNaN(sellingPrice) || sellingPrice < 0) {
          saleErrors.push(
            `Product ${pIndex + 1}: Valid selling price required (must be >= 0)`
          );
        }
      });
    }

    // Check date formats
    try {
      if (sale.invoiceDate) {
        const parsedDate = parseDateString(sale.invoiceDate);
        if (!parsedDate || isNaN(parsedDate.getTime())) {
          saleErrors.push("Invalid invoice date format");
        }
      }
    } catch (dateError) {
      saleErrors.push("Invalid date format");
    }

    if (saleErrors.length > 0) {
      errors.push({
        index: i,
        invoiceNumber: sale.invoiceNumber || `Row-${i + 1}`,
        errors: saleErrors,
        type: "validation",
      });
    } else {
      validData.push(sale);
    }
  }

  return {
    validData,
    errors,
    hasCriticalErrors: errors.length > 0 && validData.length === 0,
  };
};

// ============================================================================
// 📊 IMPORT RELATED ENDPOINTS
// ============================================================================

// NEW: Enhanced import endpoint with session support
// NEW: Enhanced import endpoint with session support
router.post("/sales/import", async (req, res) => {
  const sessionId = createSessionId();
  const batchSize = 50;

  try {
    const salesData = req.body;

    console.log("📥 Import request received");
    console.log("Request body type:", typeof salesData);
    console.log("Is array?", Array.isArray(salesData));
    
    if (salesData && typeof salesData === 'object' && !Array.isArray(salesData)) {
      console.log("Request body keys:", Object.keys(salesData));
    }

    // ✅ CORRECTED: Check if it's an object with invoices property
    let invoices = [];
    if (Array.isArray(salesData)) {
      invoices = salesData;
      console.log(`Processing as array: ${invoices.length} items`);
    } else if (salesData && Array.isArray(salesData.invoices)) {
      invoices = salesData.invoices;
      console.log(`Processing invoices array: ${invoices.length} items`);
    } else if (salesData && salesData.invoices) {
      invoices = [salesData.invoices];
      console.log(`Processing single invoice`);
    }

    if (!invoices || invoices.length === 0) {
      console.error("❌ No invoices to import");
      return res.status(400).json({
        success: false,
        message: "No data to import",
      });
    }

    console.log(`📊 Importing ${invoices.length} invoices...`);

    // 🔥 FIX: Ensure all sales data have required fields
    const validatedInvoices = invoices.map((sale, index) => {
      // Ensure required fields exist
      const invoiceNumber = sale.invoiceNumber || 
        `IMPORT-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        recordingDate:
          sale.recordingDate || new Date().toISOString().split("T")[0],
        invoiceNumber: invoiceNumber,
        invoiceDate: sale.invoiceDate || new Date().toISOString().split("T")[0],
        mrName: sale.mrName || "No MR Name Provided",
        customerName: sale.customerName || "Unknown Customer",
        customerId: sale.customerId || new mongoose.Types.ObjectId(),
        products: Array.isArray(sale.products)
          ? sale.products.map((product) => ({
              productName: product.productName || "Unknown Product",
              salesQty: Number(product.salesQty) || 0,
              bonusQty: Number(product.bonusQty) || 0,
              totalQty:
                (Number(product.salesQty) || 0) +
                (Number(product.bonusQty) || 0),
              sellingPrice: Number(product.sellingPrice) || 0,
              amount: Number(product.amount) || 0,
              discount: Number(product.discount) || 0,
              netSellingAmount: Number(product.netSellingAmount) || 0,
              averageUnitPrice: Number(product.averageUnitPrice) || 0,
              lc: Number(product.lc) || 0,
              profitLoss: Number(product.profitLoss) || 0,
              isProductAccept: product.isProductAccept !== false,
            }))
          : [],
        creditDays: Number(sale.creditDays) || 0,
        dueDate:
          sale.dueDate ||
          new Date(
            Date.now() + (Number(sale.creditDays) || 0) * 24 * 60 * 60 * 1000
          )
            .toISOString()
            .split("T")[0],
        deliveryDate:
          sale.deliveryDate || new Date().toISOString().split("T")[0],
        paidAmount: Number(sale.paidAmount) || 0,
        dueAmount: Number(sale.dueAmount) || 0,
        totalAmount: Number(sale.totalAmount) || 0,
        paymentStatus: sale.paymentStatus || "Credit",
        remark: sale.remark || "",
        transactionType: sale.transactionType || "regular",
      };
    });

    console.log(`✅ Validated ${validatedInvoices.length} invoices for import`);

    // Initialize progress tracking
    initializeImportProgress(sessionId, validatedInvoices.length, batchSize);

    // Respond immediately with session ID
    res.json({
      success: true,
      sessionId,
      message: "Import started",
      totalInvoices: validatedInvoices.length,
    });

    // Process in background
    processImportAsync(sessionId, validatedInvoices, batchSize);
  } catch (error) {
    console.error("🔥 Import initialization error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start import",
      error: error.message,
    });
  }
});

router.get("/sales/import/progress/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!importProgressMap.has(sessionId)) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const progress = importProgressMap.get(sessionId);

    // Calculate elapsed time
    const elapsedTime = Math.round((Date.now() - progress.startTime) / 1000);

    // Estimate remaining time
    let estimatedTimeRemaining = null;
    if (progress.progressPercentage > 0) {
      estimatedTimeRemaining = Math.round(
        (elapsedTime * (100 - progress.progressPercentage)) /
          progress.progressPercentage
      );
    }

    // 🔥 FIXED: Return the exact format expected by frontend
    const response = {
      success: true,
      progress: {
        percentage: progress.progressPercentage || 0,
        processed: progress.processedInvoices || 0,
        total: progress.totalInvoices || 0,
        status: progress.completed ? "Import completed" : "Processing...",
        completed: progress.completed || false,
        result: progress.result || null,
        // Additional fields for frontend
        successful: progress.successful || 0,
        failed: progress.failed || 0,
        cashSales: progress.cashSalesCount || 0,
        cashAmount: progress.cashAmountAdded || 0,
        summary: {
          successfullyImported: progress.successful || 0,
          failed: progress.failed || 0,
          regularTransactions: progress.transactionTypes?.regular || 0,
          returnTransactions: progress.transactionTypes?.return || 0,
          exchangeTransactions: progress.transactionTypes?.exchange || 0,
          cashSales: progress.cashSalesCount || 0,
          cashAmount: progress.cashAmountAdded || 0,
        },
      },
      sessionId,
      totalBatches: progress.totalBatches,
      currentBatch: progress.currentBatch,
      currentBatchProgress: progress.currentBatchProgress,
      elapsedTime,
      estimatedTimeRemaining,
      errorTypes: progress.errorTypes || {},
    };

    // 🔥 ADD THIS: Clean up old sessions (after 1 hour)
    if (progress.completed && Date.now() - progress.lastUpdated > 3600000) {
      importProgressMap.delete(sessionId);
      console.log(`🗑️ Cleaned up old session: ${sessionId}`);
    }

    res.json(response);
  } catch (error) {
    console.error("Error getting progress:", error);
    res.status(500).json({
      success: false,
      message: "Error getting progress",
      error: error.message,
    });
  }
});

// 🔥 NEW: Clean up old sessions periodically
const cleanupOldSessions = () => {
  const now = Date.now();
  const oneHourAgo = now - 3600000; // 1 hour in milliseconds

  for (const [sessionId, progress] of importProgressMap.entries()) {
    if (progress.completed && progress.lastUpdated < oneHourAgo) {
      importProgressMap.delete(sessionId);
      console.log(`🗑️ Cleaned up completed session: ${sessionId}`);
    }
  }
};

// Run cleanup every 30 minutes
setInterval(cleanupOldSessions, 1800000);

// 🔥 MODIFIED: Endpoint to get ALL failed invoices for a session
router.get("/import/failed-invoices/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!importProgressMap.has(sessionId)) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const progress = importProgressMap.get(sessionId);
    const errors = progress.errors || [];

    // 🔥 FIXED: Return ALL errors, not just last 50
    const failedInvoices = errors.map((error, index) => ({
      row: error.index + 1,
      invoiceNumber: error.invoiceNumber || `Error-${index + 1}`,
      customerName: error.customerName || "Unknown",
      error: error.error || "Unknown error",
      type: error.type || error.errorType || "import_error",
      products: error.products || [],
      timestamp: error.timestamp || new Date().toISOString(),
    }));

    res.json({
      success: true,
      failedInvoices,
      count: failedInvoices.length,
      sessionId,
      summary: {
        totalInvoices: progress.totalInvoices || 0,
        successful: progress.successful || 0,
        failed: progress.failed || 0,
        progressPercentage: progress.progressPercentage || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching failed invoices:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching failed invoices",
      error: error.message,
    });
  }
});

// 🔥 NEW: Endpoint to download ALL failed invoices as CSV
router.get("/import/download-failed-invoices/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!importProgressMap.has(sessionId)) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const progress = importProgressMap.get(sessionId);
    const errors = progress.errors || [];

    if (errors.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No failed invoices found for this session",
      });
    }

    // Format errors for CSV
    const csvRows = [];

    // Add headers
    csvRows.push(
      [
        "Row",
        "Invoice Number",
        "Customer Name",
        "Error Type",
        "Error Message",
        "Products",
        "Sales Quantity",
        "Bonus Quantity",
        "Timestamp",
      ].join(",")
    );

    // Add data rows
    errors.forEach((error, index) => {
      const products = error.products || [];
      const productNames = products.map((p) => p.name || "").join("; ");
      const totalSalesQty = products.reduce(
        (sum, p) => sum + (parseFloat(p.salesQty) || 0),
        0
      );
      const totalBonusQty = products.reduce(
        (sum, p) => sum + (parseFloat(p.bonusQty) || 0),
        0
      );

      const row = [
        index + 1,
        `"${error.invoiceNumber || ""}"`,
        `"${error.customerName || ""}"`,
        `"${error.type || error.errorType || "import_error"}"`,
        `"${(error.error || "").replace(/"/g, '""')}"`,
        `"${productNames}"`,
        totalSalesQty,
        totalBonusQty,
        `"${error.timestamp || new Date().toISOString()}"`,
      ];

      csvRows.push(row.join(","));
    });

    const csvContent = csvRows.join("\n");
    const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const filename = `failed_invoices_${sessionId}_${timestamp}.csv`;

    // Set headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error("Error downloading failed invoices:", error);
    res.status(500).json({
      success: false,
      message: "Error downloading failed invoices",
      error: error.message,
    });
  }
});

// ============================================================================
// ✅ NEW ENDPOINTS FOR CREDIT SALES NOT RECEIVED
// ============================================================================

router.get("/sales/pending-collection-today", async (req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const todayStart = new Date(todayStr + "T00:00:00.000Z");
    const todayEnd = new Date(todayStr + "T23:59:59.999Z");

    const pendingCollections = await SaleSummary.find({
      dueDate: {
        $gte: todayStart,
        $lte: todayEnd,
      },
      paymentStatus: { $ne: "Cash" },
      $or: [
        { dueAmount: { $gt: 0 } },
        { $expr: { $gt: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] } },
      ],
    })
      .select(
        "invoiceNumber invoiceDate mrName customerName customerId products creditDays dueDate deliveryDate paidAmount dueAmount totalAmount paymentStatus remark"
      )
      .sort({ dueDate: 1 })
      .lean();

    res.json({
      success: true,
      data: pendingCollections,
      count: pendingCollections.length,
    });
  } catch (error) {
    console.error("Error fetching pending collections for today:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching pending collections",
      data: [],
      totalAmount: 0,
      count: 0,
    });
  }
});

// 🔥 FIXED: Correct the payment status filter for credit sales
router.get("/sales/credit-sale-not-received", async (req, res) => {
  try {
    const creditSales = await SaleSummary.find({
      $or: [
        { saleReturn: { $exists: false } },
        { saleReturn: false },
        { saleReturn: null },
      ],
      paymentStatus: { $in: ["Credit", "Partial Paid"] },
      $or: [
        { dueAmount: { $gt: 0 } },
        { $expr: { $gt: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] } },
      ],
    })
      .sort({ invoiceDate: -1 })
      .lean();

    const totalAmount = creditSales.reduce((total, invoice) => {
      const outstandingAmount =
        invoice.dueAmount > 0
          ? invoice.dueAmount
          : Math.max(0, invoice.totalAmount - (invoice.paidAmount || 0));
      return total + outstandingAmount;
    }, 0);

    const formattedSales = creditSales.map((invoice) => ({
      ...invoice,
      outstandingAmount:
        invoice.dueAmount > 0
          ? invoice.dueAmount
          : Math.max(0, invoice.totalAmount - (invoice.paidAmount || 0)),
    }));

    res.json({
      success: true,
      data: formattedSales,
      totalAmount: totalAmount.toFixed(2),
      count: formattedSales.length,
      message: `Found ${formattedSales.length} credit sales where cash is not received`,
    });
  } catch (error) {
    console.error("Error fetching credit sales not received:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching credit sales",
      error: error.message,
      data: [],
      totalAmount: 0,
      count: 0,
    });
  }
});

router.get("/overdue", async (req, res) => {
  try {
    const { currentDate } = req.query;

    const referenceDate = currentDate ? new Date(currentDate) : new Date();

    const overdueInvoices = await SaleSummary.find({
      $or: [
        { saleReturn: { $exists: false } },
        { saleReturn: false },
        { saleReturn: null },
      ],
      dueDate: { $exists: true, $ne: null, $lt: referenceDate },
      $or: [
        { dueAmount: { $gt: 0 } },
        { $expr: { $gt: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] } },
      ],
    })
      .sort({ dueDate: 1 })
      .lean();

    const totalOverdueAmount = overdueInvoices.reduce((total, invoice) => {
      const overdueAmount =
        invoice.dueAmount > 0
          ? invoice.dueAmount
          : Math.max(0, invoice.totalAmount - invoice.paidAmount);
      return total + overdueAmount;
    }, 0);

    res.json({
      success: true,
      data: overdueInvoices,
      totalOverdueAmount: totalOverdueAmount,
      count: overdueInvoices.length,
      currentDate: referenceDate,
      message: `Found ${overdueInvoices.length} overdue invoices`,
    });
  } catch (error) {
    console.error("Error fetching overdue invoices:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching overdue invoices",
      error: error.message,
    });
  }
});

// ============================================================================
// 📊 ANALYTICS ENDPOINTS
// ============================================================================

router.get("/analytics/today", async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const todaySales = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: {
            $gte: today,
            $lte: now,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const result =
      todaySales.length > 0 ? todaySales[0] : { totalSales: 0, count: 0 };
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/analytics/month", async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlySales = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: {
            $gte: monthStart,
            $lte: now,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const result =
      monthlySales.length > 0 ? monthlySales[0] : { totalSales: 0, count: 0 };
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/analytics/year", async (req, res) => {
  try {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const yearlySales = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: {
            $gte: yearStart,
            $lte: now,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const result =
      yearlySales.length > 0 ? yearlySales[0] : { totalSales: 0, count: 0 };
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/analytics/dashboard", async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const prevDayEnd = new Date(yesterday);
    prevDayEnd.setHours(23, 59, 59, 999);

    const [todayResult, monthlyResult, yearlyResult, yesterdayResult] =
      await Promise.all([
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: today,
                $lte: now,
              },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$totalAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: monthStart,
                $lte: now,
              },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$totalAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: yearStart,
                $lte: now,
              },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$totalAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: yesterday,
                $lte: prevDayEnd,
              },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$totalAmount" },
            },
          },
        ]),
      ]);

    const todaySales = todayResult[0]?.amount || 0;
    const monthlySales = monthlyResult[0]?.amount || 0;
    const yearlySales = yearlyResult[0]?.amount || 0;
    const yesterdaySales = yesterdayResult[0]?.amount || 0;

    const growth =
      yesterdaySales > 0
        ? ((todaySales - yesterdaySales) / yesterdaySales) * 100
        : 0;

    res.json({
      totalSales: yearlySales,
      monthlySales,
      todaySales,
      yearSales: yearlySales,
      growth: parseFloat(growth.toFixed(2)),
    });
  } catch (error) {
    console.error("❌ Error in getSalesDashboard:", error);
    res.status(500).json({
      message: error.message,
      totalSales: 0,
      monthlySales: 0,
      todaySales: 0,
      yearSales: 0,
      growth: 0,
    });
  }
});

router.get("/analytics/breakdown", async (req, res) => {
  try {
    const { period } = req.query;

    let groupFormat;
    switch (period) {
      case "daily":
        groupFormat = {
          year: { $year: "$invoiceDate" },
          month: { $month: "$invoiceDate" },
          day: { $dayOfMonth: "$invoiceDate" },
        };
        break;
      case "monthly":
        groupFormat = {
          year: { $year: "$invoiceDate" },
          month: { $month: "$invoiceDate" },
        };
        break;
      case "yearly":
        groupFormat = {
          year: { $year: "$invoiceDate" },
        };
        break;
      default:
        groupFormat = {
          year: { $year: "$invoiceDate" },
          month: { $month: "$invoiceDate" },
          day: { $dayOfMonth: "$invoiceDate" },
        };
    }

    const salesBreakdown = await SaleSummary.aggregate([
      {
        $group: {
          _id: groupFormat,
          totalSales: { $sum: "$totalAmount" },
          count: { $sum: 1 },
          date: { $first: "$invoiceDate" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    res.json(salesBreakdown);
  } catch (error) {
    console.error("❌ Error in sales breakdown analytics:", error);
    res.status(500).json({
      message: error.message,
      period: req.query.period,
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================================
// 💰 OUTSTANDING ENDPOINTS
// ============================================================================

router.get("/outstanding/custom-range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const outstandingData = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: {
            $gte: start,
            $lte: end,
          },
          $or: [
            { dueAmount: { $gt: 0 } },
            { paymentStatus: { $in: ["Credit", "Partial Paid"] } },
          ],
        },
      },
      {
        $project: {
          recordingDate: 1,
          invoiceNumber: 1,
          invoiceDate: 1,
          mrName: 1,
          customerName: 1,
          customerCode: 1,
          customerId: 1,
          creditDays: 1,
          dueDate: 1,
          deliveryDate: 1,
          paidAmount: 1,
          dueAmount: 1,
          totalAmount: 1,
          paymentStatus: 1,
          remark: 1,
          products: 1,
        },
      },
      {
        $sort: { recordingDate: -1 },
      },
    ]);

    const totalOutstanding = outstandingData.reduce(
      (sum, invoice) => sum + (invoice.dueAmount || 0),
      0
    );

    res.json({
      success: true,
      totalOutstanding,
      outstandingData,
      count: outstandingData.length,
    });
  } catch (error) {
    console.error("Error fetching custom range outstanding:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      totalOutstanding: 0,
      outstandingData: [],
    });
  }
});

router.get("/outstanding/analytics/dashboard", async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const prevDayEnd = new Date(yesterday);
    prevDayEnd.setHours(23, 59, 59, 999);

    const outstandingFilter = {
      $or: [
        { dueAmount: { $gt: 0 } },
        { paymentStatus: { $in: ["Credit", "Partial Paid"] } },
      ],
    };

    const [todayResult, monthlyResult, yearlyResult, yesterdayResult] =
      await Promise.all([
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: today,
                $lte: now,
              },
              ...outstandingFilter,
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$dueAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: monthStart,
                $lte: now,
              },
              ...outstandingFilter,
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$dueAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: yearStart,
                $lte: now,
              },
              ...outstandingFilter,
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$dueAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: yesterday,
                $lte: prevDayEnd,
              },
              ...outstandingFilter,
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$dueAmount" },
            },
          },
        ]),
      ]);

    const todayOutstanding = todayResult[0]?.amount || 0;
    const monthlyOutstanding = monthlyResult[0]?.amount || 0;
    const yearlyOutstanding = yearlyResult[0]?.amount || 0;
    const yesterdayOutstanding = yesterdayResult[0]?.amount || 0;

    const growth =
      yesterdayOutstanding > 0
        ? ((todayOutstanding - yesterdayOutstanding) / yesterdayOutstanding) *
          100
        : 0;

    res.json({
      totalOutstanding: yearlyOutstanding,
      monthlyOutstanding,
      todayOutstanding,
      yearOutstanding: yearlyOutstanding,
      growth: parseFloat(growth.toFixed(2)),
    });
  } catch (error) {
    console.error("❌ Error in getOutstandingDashboard:", error);
    res.status(500).json({
      totalOutstanding: 0,
      monthlyOutstanding: 0,
      todayOutstanding: 0,
      yearOutstanding: 0,
      growth: 0,
    });
  }
});

const getTableDateRanges = (period) => {
  const now = new Date();

  switch (period) {
    case "Today":
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      return { start: todayStart, end: now };

    case "Month":
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart, end: now };

    case "Year":
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { start: yearStart, end: now };

    case "custom":
      return null;

    default:
      const defaultStart = new Date(now);
      defaultStart.setHours(0, 0, 0, 0);
      return { start: defaultStart, end: now };
  }
};

router.get("/outstanding/table-data", async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    let dateFilter = {};

    if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      dateFilter = {
        invoiceDate: {
          $gte: start,
          $lte: end,
        },
      };
    } else {
      const dateRange = getTableDateRanges(period);
      if (dateRange) {
        dateFilter = {
          invoiceDate: {
            $gte: dateRange.start,
            $lte: dateRange.end,
          },
        };
      }
    }

    dateFilter = {
      ...dateFilter,
      $or: [
        { dueAmount: { $gt: 0 } },
        { paymentStatus: { $in: ["Credit", "Partial Paid"] } },
      ],
    };

    const outstandingData = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $project: {
          recordingDate: 1,
          invoiceNumber: 1,
          invoiceDate: 1,
          mrName: 1,
          customerName: 1,
          customerCode: 1,
          customerId: 1,
          creditDays: 1,
          dueDate: 1,
          deliveryDate: 1,
          paidAmount: 1,
          dueAmount: 1,
          totalAmount: 1,
          paymentStatus: 1,
          remark: 1,
          products: 1,
        },
      },
      {
        $sort: { recordingDate: -1 },
      },
    ]);

    res.json({
      success: true,
      data: outstandingData,
      count: outstandingData.length,
      period: period,
    });
  } catch (error) {
    console.error("Error fetching outstanding table data:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      count: 0,
    });
  }
});

router.get("/outstanding/mr-wise", async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    let dateFilter = {};

    if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      dateFilter = {
        invoiceDate: {
          $gte: start,
          $lte: end,
        },
      };
    } else {
      const dateRange = getTableDateRanges(period);
      if (dateRange) {
        dateFilter = {
          invoiceDate: {
            $gte: dateRange.start,
            $lte: dateRange.end,
          },
        };
      }
    }

    dateFilter = {
      ...dateFilter,
      $or: [
        { dueAmount: { $gt: 0 } },
        { paymentStatus: { $in: ["Credit", "Partial Paid"] } },
      ],
    };

    const mrWiseOutstanding = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $group: {
          _id: "$mrName",
          totalOutstanding: { $sum: "$dueAmount" },
          invoiceCount: { $sum: 1 },
          customerCount: { $addToSet: "$customerName" },
          invoices: {
            $push: {
              invoiceNumber: "$invoiceNumber",
              customerName: "$customerName",
              dueAmount: "$dueAmount",
              paymentStatus: "$paymentStatus",
              dueDate: "$dueDate",
              recordingDate: "$recordingDate",
            },
          },
        },
      },
      {
        $project: {
          mrName: "$_id",
          totalOutstanding: 1,
          invoiceCount: 1,
          customerCount: { $size: "$customerCount" },
          invoices: 1,
          _id: 0,
        },
      },
      {
        $sort: { totalOutstanding: -1 },
      },
    ]);

    res.json({
      success: true,
      data: mrWiseOutstanding,
      count: mrWiseOutstanding.length,
      period: period,
    });
  } catch (error) {
    console.error("Error fetching MR-wise outstanding:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      count: 0,
    });
  }
});

router.get("/outstanding/customer-wise", async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    let dateFilter = {};

    if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      dateFilter = {
        invoiceDate: {
          $gte: start,
          $lte: end,
        },
      };
    } else {
      const dateRange = getTableDateRanges(period);
      if (dateRange) {
        dateFilter = {
          invoiceDate: {
            $gte: dateRange.start,
            $lte: dateRange.end,
          },
        };
      }
    }

    dateFilter = {
      ...dateFilter,
      $or: [
        { dueAmount: { $gt: 0 } },
        { paymentStatus: { $in: ["Credit", "Partial Paid"] } },
      ],
    };

    const customerWiseOutstanding = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $group: {
          _id: "$customerName",
          totalOutstanding: { $sum: "$dueAmount" },
          invoiceCount: { $sum: 1 },
          mrNames: { $addToSet: "$mrName" },
          oldestDueDate: { $min: "$dueDate" },
          invoices: {
            $push: {
              invoiceNumber: "$invoiceNumber",
              mrName: "$mrName",
              dueAmount: "$dueAmount",
              paymentStatus: "$paymentStatus",
              dueDate: "$dueDate",
              recordingDate: "$recordingDate",
            },
          },
        },
      },
      {
        $project: {
          customerName: "$_id",
          totalOutstanding: 1,
          invoiceCount: 1,
          mrCount: { $size: "$mrNames" },
          oldestDueDate: 1,
          invoices: 1,
          _id: 0,
        },
      },
      {
        $sort: { totalOutstanding: -1 },
      },
    ]);

    res.json({
      success: true,
      data: customerWiseOutstanding,
      count: customerWiseOutstanding.length,
      period: period,
    });
  } catch (error) {
    console.error("Error fetching customer-wise outstanding:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      count: 0,
    });
  }
});

// ============================================================================
// 📈 SALES ENDPOINTS
// ============================================================================

router.get("/sales/analytics/custom-range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ message: "Start date and end date are required" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const sales = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: {
            $gte: start,
            $lte: end,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const result = sales.length > 0 ? sales[0] : { totalSales: 0, count: 0 };
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/sales/highest-sales", async (req, res) => {
  try {
    const { limit = 5, period } = req.query;
    let dateFilter = {};
    const dateRange = getTableDateRanges(period);

    if (dateRange) {
      dateFilter = {
        invoiceDate: {
          $gte: dateRange.start,
          $lte: dateRange.end,
        },
      };
    }

    const highestSales = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $unwind: "$products",
      },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate" } },
          productName: "$products.productName",
          salesPerson: "$mrName",
          quantity: "$products.salesQty",
          amount: "$products.netSellingAmount",
          customer: "$customerInfo.name",
          invoiceNumber: 1,
          timeAgo: "$invoiceDate",
        },
      },
      {
        $sort: { amount: -1 },
      },
      {
        $limit: parseInt(limit),
      },
    ]);

    const now = new Date();
    const transformedData = highestSales.map((sale) => {
      const saleDate = new Date(sale.timeAgo);
      const diffMs = now - saleDate;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      let timeAgo = "";
      if (diffDays > 0) {
        timeAgo = `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
      } else if (diffHours > 0) {
        timeAgo = `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
      } else {
        timeAgo = "Just now";
      }

      return {
        ...sale,
        timeAgo,
      };
    });

    res.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
      period: period,
    });
  } catch (error) {
    console.error("❌ Error fetching highest sales:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      count: 0,
    });
  }
});

router.get("/sales/table-data", async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    let dateFilter = {};

    if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      dateFilter = {
        invoiceDate: {
          $gte: start,
          $lte: end,
        },
      };
    } else {
      const dateRange = getTableDateRanges(period);
      if (dateRange) {
        dateFilter = {
          invoiceDate: {
            $gte: dateRange.start,
            $lte: dateRange.end,
          },
        };
      }
    }

    const salesData = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $unwind: "$products",
      },
      {
        $project: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate" } },
          productName: "$products.productName",
          salesPerson: "$mrName",
          quantity: "$products.salesQty",
          amount: "$products.netSellingAmount",
          customer: "$customerName",
          invoiceNumber: 1,
          bonusQty: "$products.bonusQty",
          totalQty: "$products.totalQty",
          sellingPrice: "$products.sellingPrice",
          discount: "$products.discount",
          paymentStatus: 1,
          remark: 1,
          customerId: 1,
          recordingDate: 1,
          dueDate: 1,
          paidAmount: 1,
          dueAmount: 1,
          totalAmount: 1,
        },
      },
      {
        $sort: { date: -1 },
      },
    ]);

    const transformedData = salesData.map((sale) => ({
      date: sale.date,
      productName: sale.productName,
      salesPerson: sale.salesPerson,
      quantity: sale.quantity,
      amount: sale.amount,
      customer: sale.customer || "N/A",
      invoiceNumber: sale.invoiceNumber,
      bonusQty: sale.bonusQty,
      totalQty: sale.totalQty,
      sellingPrice: sale.sellingPrice,
      discount: sale.discount,
      paymentStatus: sale.paymentStatus,
      remark: sale.remark,
      customerId: sale.customerId,
      recordingDate: sale.recordingDate,
      dueDate: sale.dueDate,
      paidAmount: sale.paidAmount,
      dueAmount: sale.dueAmount,
      totalAmount: sale.totalAmount,
    }));

    res.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
      period: period,
    });
  } catch (error) {
    console.error("❌ Error fetching sales table data:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      count: 0,
    });
  }
});

router.get("/sales/summary-cards", async (req, res) => {
  try {
    const { period } = req.query;

    let dateFilter = {};
    const dateRange = getTableDateRanges(period);

    if (dateRange) {
      dateFilter = {
        invoiceDate: {
          $gte: dateRange.start,
          $lte: dateRange.end,
        },
      };
    }

    const summary = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $unwind: "$products",
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$products.netSellingAmount" },
          totalQuantity: { $sum: "$products.salesQty" },
          totalTransactions: { $sum: 1 },
          averageOrderValue: { $avg: "$totalAmount" },
        },
      },
    ]);

    const result =
      summary.length > 0
        ? summary[0]
        : {
            totalSales: 0,
            totalQuantity: 0,
            totalTransactions: 0,
            averageOrderValue: 0,
          };

    res.json({
      success: true,
      period: period,
      summary: result,
    });
  } catch (error) {
    console.error("❌ Error fetching sales summary:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      summary: {
        totalSales: 0,
        totalQuantity: 0,
        totalTransactions: 0,
        averageOrderValue: 0,
      },
    });
  }
});

router.get("/custom-range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const sales = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: {
            $gte: start,
            $lte: end,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const result = sales.length > 0 ? sales[0] : { totalSales: 0, count: 0 };

    res.json({
      success: true,
      totalSales: result.totalSales,
      count: result.count,
    });
  } catch (error) {
    console.error("Error in custom-range endpoint:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      totalSales: 0,
    });
  }
});

// ============================================================================
// 🛒 PRODUCT-WISE SALES ENDPOINTS
// ============================================================================

router.get("/sales/product-wise", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      startDate,
      endDate,
      productName,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        matchConditions.recordingDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    if (productName && productName.trim() !== "") {
      matchConditions["products.productName"] = new RegExp(
        productName.trim(),
        "i"
      );
    }

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { mrName: searchRegex },
        { customerCode: searchRegex },
        { "products.productName": searchRegex },
      ];
    }

    const productWiseAggregate = await SaleSummary.aggregate([
      { $match: matchConditions },
      { $unwind: "$products" },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$products.productName",
          totalRecords: { $sum: 1 },
          totalSalesQty: { $sum: "$products.salesQty" },
          totalBonusQty: { $sum: "$products.bonusQty" },
          totalNetSellingAmount: { $sum: "$products.netSellingAmount" },
          totalProfitLoss: { $sum: "$products.profitLoss" },
        },
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          products: { $push: "$$ROOT" },
        },
      },
    ]);

    let totalProducts = 0;
    let productSummary = [];

    if (productWiseAggregate.length > 0) {
      totalProducts = productWiseAggregate[0].totalProducts;
      productSummary = productWiseAggregate[0].products;
    }

    const paginatedProducts = productSummary.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalProducts / limitNum);

    if (paginatedProducts.length > 0) {
      const productNames = paginatedProducts.map((p) => p._id);

      const detailedRecords = await SaleSummary.aggregate([
        { $match: matchConditions },
        { $unwind: "$products" },
        {
          $match: {
            "products.productName": { $in: productNames },
          },
        },
        {
          $lookup: {
            from: "customers",
            localField: "customerCode",
            foreignField: "customerCode",
            as: "customerInfo",
          },
        },
        {
          $unwind: {
            path: "$customerInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            recordingDate: 1,
            invoiceNumber: 1,
            invoiceDate: 1,
            mrName: 1,
            customerCode: 1,
            "customerInfo.name": 1,
            "customerInfo.customerNumber": 1,
            "customerInfo.address": 1,
            "customerInfo.zone": 1,
            productName: "$products.productName",
            salesQty: "$products.salesQty",
            bonusQty: "$products.bonusQty",
            totalQty: "$products.totalQty",
            sellingPrice: "$products.sellingPrice",
            amount: "$products.amount",
            discount: "$products.discount",
            netSellingAmount: "$products.netSellingAmount",
            averageUnitPrice: "$products.averageUnitPrice",
            lc: "$products.lc",
            profitLoss: "$products.profitLoss",
            isProductAccept: "$products.isProductAccept",
            creditDays: 1,
            dueDate: 1,
            deliveryDate: 1,
            paidAmount: 1,
            dueAmount: 1,
            totalAmount: 1,
            paymentStatus: 1,
            remark: 1,
          },
        },
        { $sort: { recordingDate: -1, productName: 1 } },
      ]);

      const result = paginatedProducts.map((product) => ({
        productName: product._id,
        summary: {
          totalSalesQty: product.totalSalesQty,
          totalBonusQty: product.totalBonusQty,
          totalNetSellingAmount: product.totalNetSellingAmount,
          totalProfitLoss: product.totalProfitLoss,
          totalRecords: product.totalRecords,
        },
        details: detailedRecords
          .filter((record) => record.productName === product._id)
          .slice(0, 100),
      }));

      res.status(200).json({
        products: result,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalProducts,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      });
    } else {
      res.status(200).json({
        products: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalProducts: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    }
  } catch (error) {
    console.error("❌ Error fetching product-wise sales:", error);
    res.status(500).json({
      message: "Failed to fetch product-wise sales.",
      error: error.message,
    });
  }
});

router.get("/sales/product/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const { page = 1, limit = 10, startDate, endDate } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = {
      "products.productName": decodeURIComponent(productName),
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        matchConditions.recordingDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    const totalCount = await SaleSummary.countDocuments(matchConditions);

    const salesData = await SaleSummary.aggregate([
      { $match: matchConditions },
      { $unwind: "$products" },
      {
        $match: {
          "products.productName": decodeURIComponent(productName),
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          recordingDate: 1,
          invoiceNumber: 1,
          invoiceDate: 1,
          mrName: 1,
          customerCode: 1,
          "customerInfo.name": 1,
          "customerInfo.customerNumber": 1,
          "customerInfo.address": 1,
          "customerInfo.zone": 1,
          productName: "$products.productName",
          salesQty: "$products.salesQty",
          bonusQty: "$products.bonusQty",
          totalQty: "$products.totalQty",
          sellingPrice: "$products.sellingPrice",
          amount: "$products.amount",
          discount: "$products.discount",
          netSellingAmount: "$products.netSellingAmount",
          averageUnitPrice: "$products.averageUnitPrice",
          lc: "$products.lc",
          profitLoss: "$products.profitLoss",
          isProductAccept: "$products.isProductAccept",
          creditDays: 1,
          dueDate: 1,
          deliveryDate: 1,
          paidAmount: 1,
          dueAmount: 1,
          totalAmount: 1,
          paymentStatus: 1,
          remark: 1,
        },
      },
      { $sort: { recordingDate: -1 } },
      { $skip: skip },
      { $limit: limitNum },
    ]);

    const productSummary = await SaleSummary.aggregate([
      { $match: matchConditions },
      { $unwind: "$products" },
      {
        $match: {
          "products.productName": decodeURIComponent(productName),
        },
      },
      {
        $group: {
          _id: "$products.productName",
          totalSalesQty: { $sum: "$products.salesQty" },
          totalBonusQty: { $sum: "$products.bonusQty" },
          totalNetSellingAmount: { $sum: "$products.netSellingAmount" },
          totalProfitLoss: { $sum: "$products.profitLoss" },
          totalRecords: { $sum: 1 },
          averageSellingPrice: { $avg: "$products.sellingPrice" },
          averageProfitLoss: { $avg: "$products.profitLoss" },
        },
      },
    ]);

    const summary =
      productSummary.length > 0
        ? productSummary[0]
        : {
            _id: decodeURIComponent(productName),
            totalSalesQty: 0,
            totalBonusQty: 0,
            totalNetSellingAmount: 0,
            totalProfitLoss: 0,
            totalRecords: 0,
            averageSellingPrice: 0,
            averageProfitLoss: 0,
          };

    const totalPages = Math.ceil(totalCount / limitNum);

    res.status(200).json({
      productName: decodeURIComponent(productName),
      summary,
      sales: salesData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching product sales details:", error);
    res.status(500).json({
      message: "Failed to fetch product sales details.",
      error: error.message,
    });
  }
});

// ============================================================================
// ➕ SALES CRUD OPERATIONS
// ============================================================================

router.post("/sales", async (req, res) => {
  try {
    const saleData = req.body;

    if (!saleData || typeof saleData !== "object") {
      return res.status(400).json({ error: "Invalid or missing request body" });
    }

    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerCode",
      "products",
    ];

    const missingFields = requiredFields.filter(
      (field) =>
        saleData[field] === undefined ||
        saleData[field] === null ||
        saleData[field] === ""
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    if (!Array.isArray(saleData.products) || saleData.products.length === 0) {
      return res
        .status(400)
        .json({ error: "Products array is missing or empty" });
    }

    const invoiceExists = await checkInvoiceNumberExists(
      saleData.invoiceNumber
    );
    if (invoiceExists) {
      return res.status(400).json({
        error: `Invoice number "${saleData.invoiceNumber}" already exists. Please use a different invoice number.`,
      });
    }

    // 🔥 FIX: Ensure mrName has a default value
    if (!saleData.mrName || saleData.mrName.trim() === "") {
      saleData.mrName = "No MR Name Provided";
    }

    // Try to find MR (staff) by name
    let mrStaff = null;
    if (saleData.mrName) {
      mrStaff = await Staff.findOne({
        $or: [
          { name: { $regex: new RegExp(saleData.mrName.trim(), "i") } },
          { email: { $regex: new RegExp(saleData.mrName.trim(), "i") } },
        ],
      });
    }

    // Check if this is a return transaction
    const isReturn = isReturnTransaction(
      saleData.remark,
      saleData.paymentStatus
    );

    // Check if this is an exchange transaction
    const isExchange =
      saleData.remark?.toLowerCase().includes("exchange") ||
      saleData.products.some((p) =>
        (p.remark || "").toLowerCase().includes("exchange")
      );

    const totalAmount = saleData.products.reduce(
      (total, product) => total + (parseFloat(product.netSellingAmount) || 0),
      0
    );

    const paidAmount = parseFloat(saleData.paidAmount) || 0;
    const dueAmount = totalAmount - paidAmount;

    const paymentStatus = mapPaymentStatus(saleData.paymentStatus);

    // 🔥 MODIFIED: Process products with enhanced product finder
    const processedProducts = await Promise.all(
      saleData.products.map(async (product) => {
        let salesQty = Number(product.salesQty) || 0;
        let bonusQty = Number(product.bonusQty) || 0;

        if (isReturn && salesQty > 0) {
          salesQty = -salesQty;
        }
        if (isReturn && bonusQty > 0) {
          bonusQty = -bonusQty;
        }

        const totalQty = salesQty + bonusQty;

        const existingProduct = await findProductInInventory(
          product.productName
        );

        if (!existingProduct && !isReturn && totalQty > 0) {
          throw new Error(
            `Product "${product.productName}" not found in inventory`
          );
        }

        let lcValue = 0;
        let actualProductName = product.productName;

        if (existingProduct) {
          lcValue = existingProduct.lc || existingProduct.batches?.[0]?.lc || 0;
          actualProductName = existingProduct.productName;
        }

        if (totalQty > 0 && existingProduct) {
          try {
            if (isExchange) {
              await updateInventoryForExchange(
                actualProductName,
                salesQty,
                bonusQty,
                false
              );
            } else {
              await updateReportInHandAfterSale(
                actualProductName,
                salesQty,
                bonusQty
              );
            }
          } catch (inventoryError) {
            throw new Error(
              `Insufficient stock for ${product.productName}: ${inventoryError.message}`
            );
          }
        } else if (totalQty < 0 && existingProduct) {
          try {
            await updateReportInHandAfterSale(
              actualProductName,
              salesQty,
              bonusQty
            );
          } catch (inventoryError) {
            throw new Error(
              `Failed to process return for ${product.productName}: ${inventoryError.message}`
            );
          }
        }

        let profitLoss;
        if (isReturn) {
          profitLoss = -Math.abs(
            Number(product.netSellingAmount) - Math.abs(totalQty) * lcValue
          );
        } else {
          profitLoss = Number(product.netSellingAmount) - totalQty * lcValue;
        }

        return {
          productName: actualProductName,
          originalProductName: product.productName,
          salesQty: salesQty,
          bonusQty: bonusQty,
          totalQty: totalQty,
          sellingPrice: Number(product.sellingPrice),
          amount: Number(product.amount),
          discount: Number(product.discount) || 0,
          netSellingAmount: Number(product.netSellingAmount),
          averageUnitPrice: Number(product.averageUnitPrice),
          lc: lcValue,
          profitLoss: profitLoss,
          isProductAccept:
            product.isProductAccept !== undefined
              ? product.isProductAccept
              : true,
          isExchangeProduct: isExchange && totalQty <= 0,
          isReturnProduct: isReturn,
        };
      })
    );

    // Get customer information
    let customerName = saleData.customerName || "";
    const customer = await Customer.findOne({
      customerCode: saleData.customerCode,
    });
    if (customer) {
      customerName = customer.name;
    }

    const newSaleData = {
      recordingDate: new Date(saleData.recordingDate),
      invoiceNumber: saleData.invoiceNumber,
      invoiceDate: new Date(saleData.invoiceDate),
      mrName: saleData.mrName || "No MR Name Provided",
      mrId: mrStaff ? mrStaff._id : null, // Add MR ID if found
      customerName,
      customerCode: saleData.customerCode,
      customerId: saleData.customerId || "",
      products: processedProducts,
      creditDays: saleData.creditDays ? Number(saleData.creditDays) : 0,
      dueDate: saleData.dueDate ? new Date(saleData.dueDate) : null,
      deliveryDate: saleData.deliveryDate
        ? new Date(saleData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      paymentStatus: paymentStatus,
      remark: saleData.remark || saleData.remarks || "",
      isExchange: isExchange,
      isReturn: isReturn,
    };

    const savedSale = await SaleSummary.create(newSaleData);

    // 🔥 CORRECTED: Add cash to MR if payment is Cash or Paid
    let cashResult = null;
    if (paymentStatus === "Cash" || paymentStatus === "Paid") {
      if (paidAmount > 0) {
        try {
          cashResult = await addCashToMR({
            _id: savedSale._id,
            mrName: savedSale.mrName,
            mrId: mrStaff ? mrStaff._id : null,
            paidAmount: savedSale.paidAmount,
            invoiceNumber: savedSale.invoiceNumber,
            invoiceDate: savedSale.invoiceDate,
            customerName: savedSale.customerName,
            paymentStatus: savedSale.paymentStatus,
            recordingDate: savedSale.recordingDate,
          });

          if (cashResult.success) {
            console.log(
              `💰 Added $${paidAmount} to MR ${savedSale.mrName}'s cash for sale ${savedSale.invoiceNumber}`
            );
          } else {
            console.log(`⚠️ Cash not added: ${cashResult.reason}`);
          }
        } catch (cashError) {
          console.error(
            `❌ Failed to add cash to MR for sale ${savedSale.invoiceNumber}:`,
            cashError.message
          );
          // Don't fail the sale creation because of cash tracking error
        }
      }
    }

    res.status(201).json({
      message: `Sale with ${
        savedSale.products.length
      } product(s) added successfully${
        isExchange ? " (Exchange Transaction)" : ""
      }${isReturn ? " (Return Transaction)" : ""}`,
      sale: savedSale,
      cashAdded: cashResult
        ? {
            success: true,
            mrName: cashResult.mrName,
            amount: cashResult.amountAdded,
            currentCash: cashResult.currentCash,
          }
        : null,
    });
  } catch (error) {
    console.error("❌ Sale creation error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        error: `Invoice number "${req.body.invoiceNumber}" already exists.`,
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: "Failed to add new sale" });
  }
});

// 🔥 MODIFIED: CORRECTED EDIT/UPDATE ENDPOINT WITH RETURN SUPPORT
router.put("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Get the original sale to compare changes
    const originalSale = await SaleSummary.findById(id);
    if (!originalSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    // Check for duplicate invoice number if it's being changed
    if (
      req.body.invoiceNumber &&
      req.body.invoiceNumber !== originalSale.invoiceNumber
    ) {
      const invoiceExists = await checkInvoiceNumberExists(
        req.body.invoiceNumber,
        id
      );
      if (invoiceExists) {
        return res.status(400).json({
          error: `Invoice number "${req.body.invoiceNumber}" already exists. Please use a different invoice number.`,
        });
      }
    }

    // Check if this is a return transaction
    const isReturn = isReturnTransaction(
      req.body.remark,
      req.body.paymentStatus
    );

    // Check if this is an exchange transaction
    const isExchange =
      req.body.remark?.toLowerCase().includes("exchange") ||
      originalSale.isExchange;

    // 🔥 CRITICAL FIX: Restore original inventory first
    for (const product of originalSale.products) {
      const totalQty = product.salesQty + product.bonusQty;
      if (totalQty !== 0) {
        try {
          await restoreReportInHandAfterSaleDeletion(
            product.productName,
            product.salesQty,
            product.bonusQty,
            originalSale.isExchange,
            originalSale.remark,
            originalSale.paymentStatus
          );
        } catch (inventoryError) {
          console.error(
            `❌ Failed to restore inventory for ${product.productName}:`,
            inventoryError.message
          );
        }
      }
    }

    // Process the updated sale data
    const saleData = req.body;

    // 🔥 FIX: Ensure mrName has a default value
    if (!saleData.mrName || saleData.mrName.trim() === "") {
      saleData.mrName = originalSale.mrName || "No MR Name Provided";
    }

    // Try to find MR (staff) by name
    let mrStaff = null;
    if (saleData.mrName) {
      mrStaff = await Staff.findOne({
        $or: [
          { name: { $regex: new RegExp(saleData.mrName.trim(), "i") } },
          { email: { $regex: new RegExp(saleData.mrName.trim(), "i") } },
        ],
      });
    }

    const updatedProducts = await Promise.all(
      saleData.products.map(async (product) => {
        let salesQty = Number(product.salesQty) || 0;
        let bonusQty = Number(product.bonusQty) || 0;

        if (isReturn && salesQty > 0) {
          salesQty = -salesQty;
        }
        if (isReturn && bonusQty > 0) {
          bonusQty = -bonusQty;
        }

        const totalQty = salesQty + bonusQty;

        const existingProduct = await findProductInInventory(
          product.productName
        );

        if (!existingProduct && !isReturn && totalQty > 0) {
          throw new Error(
            `Product "${product.productName}" not found in inventory`
          );
        }

        let lcValue = 0;
        let actualProductName = product.productName;

        if (existingProduct) {
          lcValue = existingProduct.lc || existingProduct.batches?.[0]?.lc || 0;
          actualProductName = existingProduct.productName;
        }

        if (totalQty > 0 && existingProduct) {
          try {
            if (isExchange) {
              await updateInventoryForExchange(
                actualProductName,
                salesQty,
                bonusQty,
                false
              );
            } else {
              await updateReportInHandAfterSale(
                actualProductName,
                salesQty,
                bonusQty
              );
            }
          } catch (inventoryError) {
            throw new Error(
              `Insufficient stock for ${product.productName}: ${inventoryError.message}`
            );
          }
        } else if (totalQty < 0 && existingProduct) {
          try {
            await updateReportInHandAfterSale(
              actualProductName,
              salesQty,
              bonusQty
            );
          } catch (inventoryError) {
            throw new Error(
              `Failed to process return for ${product.productName}: ${inventoryError.message}`
            );
          }
        }

        let profitLoss;
        if (isReturn) {
          profitLoss = -Math.abs(
            Number(product.netSellingAmount) - Math.abs(totalQty) * lcValue
          );
        } else {
          profitLoss = Number(product.netSellingAmount) - totalQty * lcValue;
        }

        return {
          productName: actualProductName,
          originalProductName: product.productName,
          salesQty: salesQty,
          bonusQty: bonusQty,
          totalQty: totalQty,
          sellingPrice: Number(product.sellingPrice),
          amount: Number(product.amount),
          discount: Number(product.discount) || 0,
          netSellingAmount: Number(product.netSellingAmount),
          averageUnitPrice: Number(product.averageUnitPrice),
          lc: lcValue,
          profitLoss: profitLoss,
          isProductAccept:
            product.isProductAccept !== undefined
              ? product.isProductAccept
              : true,
          isExchangeProduct: isExchange && totalQty <= 0,
          isReturnProduct: isReturn,
        };
      })
    );

    const totalAmount = updatedProducts.reduce(
      (total, product) => total + (parseFloat(product.netSellingAmount) || 0),
      0
    );
    const paidAmount = parseFloat(saleData.paidAmount) || 0;
    const dueAmount = totalAmount - paidAmount;

    const updatedSaleData = {
      recordingDate: new Date(saleData.recordingDate),
      invoiceNumber: saleData.invoiceNumber,
      invoiceDate: new Date(saleData.invoiceDate),
      mrName: saleData.mrName || originalSale.mrName || "No MR Name Provided",
      mrId: mrStaff ? mrStaff._id : originalSale.mrId, // Update MR ID
      customerName: saleData.customerName,
      customerCode: saleData.customerCode,
      customerId: saleData.customerId || "",
      products: updatedProducts,
      creditDays: saleData.creditDays ? Number(saleData.creditDays) : 0,
      dueDate: saleData.dueDate ? new Date(saleData.dueDate) : null,
      deliveryDate: saleData.deliveryDate
        ? new Date(saleData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      paymentStatus: mapPaymentStatus(saleData.paymentStatus),
      remark: saleData.remark || saleData.remarks || "",
      updatedAt: new Date(),
      isExchange: isExchange,
      isReturn: isReturn,
    };

    // Save the updated sale
    const updatedSale = await SaleSummary.findByIdAndUpdate(
      id,
      updatedSaleData,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    // 🔥 CORRECTED: Handle MR cash updates during sale edit
    let cashUpdated = false;
    let cashAmount = 0;
    let cashResult = null;

    // Check if payment status changed
    const wasCashPaid = ["Cash", "Paid"].includes(originalSale.paymentStatus);
    const nowCashPaid = ["Cash", "Paid"].includes(updatedSale.paymentStatus);

    if (!wasCashPaid && nowCashPaid) {
      // Changed from non-cash to cash - add cash
      try {
        cashResult = await addCashToMR({
          mrName: updatedSale.mrName,
          mrId: mrStaff ? mrStaff._id : updatedSale.mrId,
          paidAmount: updatedSale.paidAmount,
          invoiceNumber: updatedSale.invoiceNumber,
          invoiceDate: updatedSale.invoiceDate,
          customerName: updatedSale.customerName,
          paymentStatus: updatedSale.paymentStatus,
        });

        if (cashResult.success) {
          cashUpdated = true;
          cashAmount = cashResult.amountAdded;
        }
      } catch (cashError) {
        console.error(`⚠️ Failed to add cash to MR: ${cashError.message}`);
      }
    } else if (wasCashPaid && !nowCashPaid) {
      // Changed from cash to non-cash - remove cash
      try {
        cashResult = await removeCashFromMR({
          mrName: originalSale.mrName,
          mrId: originalSale.mrId,
          paidAmount: originalSale.paidAmount,
          invoiceNumber: originalSale.invoiceNumber,
          paymentStatus: originalSale.paymentStatus,
        });

        if (cashResult.success) {
          cashUpdated = true;
          cashAmount = -cashResult.amountRemoved;
        }
      } catch (cashError) {
        console.error(`⚠️ Failed to remove cash from MR: ${cashError.message}`);
      }
    } else if (wasCashPaid && nowCashPaid) {
      // Still cash, but amount might have changed
      if (updatedSale.paidAmount !== originalSale.paidAmount) {
        try {
          // First remove old amount
          await removeCashFromMR({
            mrName: originalSale.mrName,
            mrId: originalSale.mrId,
            paidAmount: originalSale.paidAmount,
            invoiceNumber: originalSale.invoiceNumber,
            paymentStatus: originalSale.paymentStatus,
          });

          // Then add new amount
          cashResult = await addCashToMR({
            mrName: updatedSale.mrName,
            mrId: mrStaff ? mrStaff._id : updatedSale.mrId,
            paidAmount: updatedSale.paidAmount,
            invoiceNumber: updatedSale.invoiceNumber,
            invoiceDate: updatedSale.invoiceDate,
            customerName: updatedSale.customerName,
            paymentStatus: updatedSale.paymentStatus,
          });

          if (cashResult.success) {
            cashUpdated = true;
            cashAmount = cashResult.amountAdded - originalSale.paidAmount;
          }
        } catch (cashError) {
          console.error(
            `⚠️ Failed to update cash amount: ${cashError.message}`
          );
        }
      }
    }

    res.status(200).json({
      message: `Sale updated successfully${
        cashUpdated
          ? ` and $${cashAmount} ${
              cashAmount > 0 ? "added to" : "removed from"
            } MR ${updatedSale.mrName}'s cash account`
          : ""
      }`,
      sale: updatedSale,
      cashUpdated,
      cashAmount,
    });
  } catch (err) {
    console.error("Error updating sale:", err);

    try {
      const originalSale = await SaleSummary.findById(id);
      if (originalSale) {
        for (const product of originalSale.products) {
          const totalQty = product.salesQty + product.bonusQty;
          if (totalQty !== 0) {
            if (originalSale.isExchange) {
              await updateInventoryForExchange(
                product.productName,
                product.salesQty,
                product.bonusQty,
                false
              );
            } else {
              await updateReportInHandAfterSale(
                product.productName,
                product.salesQty,
                product.bonusQty
              );
            }
          }
        }
      }
    } catch (rollbackError) {
      console.error("❌ Failed to rollback inventory changes:", rollbackError);
    }

    if (err.code === 11000) {
      return res.status(400).json({
        error: `Invoice number "${req.body.invoiceNumber}" already exists. Please use a different invoice number.`,
      });
    }

    res.status(500).json({
      error: "Failed to update sales record.",
      details: err.message,
    });
  }
});

// 🔥 NEW ENDPOINT TO GET ALL SALES WITHOUT PAGINATION
router.get("/sales/all", async (req, res) => {
  try {
    const { search = "", tab = "All" } = req.query;

    const matchConditions = {};

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { "products.productName": searchRegex },
      ];
    }

    if (tab && tab !== "All") {
      matchConditions.paymentStatus = new RegExp(`^${tab}$`, "i");
    }

    const summaries = await SaleSummary.find(matchConditions)
      .sort({ recordingDate: -1 })
      .select({
        recordingDate: 1,
        invoiceNumber: 1,
        invoiceDate: 1,
        mrName: 1,
        mrId: 1,
        customerCode: 1,
        customerId: 1,
        customerName: 1,
        paymentStatus: 1,
        remark: 1,
        creditDays: 1,
        dueDate: 1,
        deliveryDate: 1,
        paidAmount: 1,
        dueAmount: 1,
        totalAmount: 1,
        products: 1,
        createdAt: 1,
        updatedAt: 1,
        isExchange: 1,
        isReturn: 1,
      });

    res.status(200).json({
      summaries,
      count: summaries.length,
    });
  } catch (error) {
    console.error("❌ Error fetching all sale summaries:", error);
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

// 🔥 ORIGINAL PAGINATED ENDPOINT (keep for backward compatibility)
router.get("/sales", async (req, res) => {
  try {
    const { page = 1, limit = 9, search = "", tab = "All" } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = {};

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { "products.productName": searchRegex },
      ];
    }

    if (tab && tab !== "All") {
      matchConditions.paymentStatus = new RegExp(`^${tab}$`, "i");
    }

    const totalCount = await SaleSummary.countDocuments(matchConditions);
    const totalPages = Math.ceil(totalCount / limitNum);

    const summaries = await SaleSummary.find(matchConditions)
      .sort({ recordingDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .select({
        recordingDate: 1,
        invoiceNumber: 1,
        invoiceDate: 1,
        mrName: 1,
        mrId: 1,
        customerCode: 1,
        customerId: 1,
        customerName: 1,
        paymentStatus: 1,
        remark: 1,
        creditDays: 1,
        dueDate: 1,
        deliveryDate: 1,
        paidAmount: 1,
        dueAmount: 1,
        totalAmount: 1,
        products: 1,
        createdAt: 1,
        updatedAt: 1,
        isExchange: 1,
        isReturn: 1,
      });

    res.status(200).json({
      summaries,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching sale summaries:", error);
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

// 🔥 MODIFIED: CORRECTED DELETE ENDPOINT WITH RETURN SUPPORT
router.delete("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const saleToDelete = await SaleSummary.findById(id);

    if (!saleToDelete) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    // 🔥 CORRECTED: Remove cash from MR if it was a cash/paid sale
    if (
      (saleToDelete.paymentStatus === "Cash" ||
        saleToDelete.paymentStatus === "Paid") &&
      saleToDelete.paidAmount > 0
    ) {
      try {
        await removeCashFromMR({
          mrName: saleToDelete.mrName,
          mrId: saleToDelete.mrId,
          paidAmount: saleToDelete.paidAmount,
          invoiceNumber: saleToDelete.invoiceNumber,
          paymentStatus: saleToDelete.paymentStatus,
        });
      } catch (cashError) {
        console.error(
          `❌ Failed to remove cash from MR for deletion:`,
          cashError.message
        );
        // Continue with deletion even if cash removal fails
      }
    }

    // Restore inventory for all products in the sale
    for (const product of saleToDelete.products) {
      const totalQty = product.salesQty + product.bonusQty;
      if (totalQty !== 0) {
        try {
          await restoreReportInHandAfterSaleDeletion(
            product.productName,
            product.salesQty,
            product.bonusQty,
            saleToDelete.isExchange,
            saleToDelete.remark,
            saleToDelete.paymentStatus
          );
        } catch (inventoryError) {
          console.error(
            `❌ Failed to restore inventory for ${product.productName}:`,
            inventoryError.message
          );
        }
      }
    }

    // Delete the sale record
    const deletedSale = await SaleSummary.findByIdAndDelete(id);

    res.status(200).json({
      message: "Sales record deleted successfully and inventory restored.",
      deletedSale,
    });
  } catch (err) {
    console.error("Error deleting sale:", err);
    res.status(500).json({ error: "Failed to delete sales record." });
  }
});

// ============================================================================
// 📥 EXPORT ENDPOINTS
// ============================================================================

router.post("/sales/download-excel", async (req, res) => {
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

    const filteredSalesData = await SaleSummary.find({
      invoiceDate: { $gte: start, $lte: end },
    }).sort({ invoiceDate: 1 });

    if (filteredSalesData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No sales data found for the selected date range",
      });
    }

    const customerIds = [
      ...new Set(filteredSalesData.map((sale) => sale.customerId?.toString())),
    ];

    const customers = await Customer.find({
      _id: { $in: customerIds },
    });

    const customerMap = {};
    customers.forEach((cust) => {
      customerMap[cust._id.toString()] = cust;
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sale Summary");

    worksheet.mergeCells("A1:AD1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    const formatDateToReadable = (isoString) => {
      if (!isoString) return "";

      const date = new Date(isoString);
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
    };

    worksheet.mergeCells("A2:AD2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = `Sale Summary List (${formatDateToReadable(
      startDate
    )} to ${formatDateToReadable(endDate)})`;
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 20;

    worksheet.columns = [
      { key: "no", width: 5 },
      { key: "recordingDate", width: 18 },
      { key: "invoiceNumber", width: 18 },
      { key: "invoiceDate", width: 18 },
      { key: "mrName", width: 18 },
      { key: "customerCode", width: 18 },
      { key: "customerName", width: 25 },
      { key: "customerNumber", width: 20 },
      { key: "address", width: 35 },
      { key: "zone", width: 25 },
      { key: "productName", width: 25 },
      { key: "salesQty", width: 10 },
      { key: "bonusQty", width: 10 },
      { key: "totalQty", width: 10 },
      { key: "sellingPrice", width: 12 },
      { key: "amount", width: 12 },
      { key: "discount", width: 10 },
      { key: "netSellingAmount", width: 25 },
      { key: "averageUnitPrice", width: 25 },
      { key: "lc", width: 10 },
      { key: "profitLoss", width: 15 },
      { key: "isProductAccept", width: 15 },
      { key: "isExchangeProduct", width: 15 },
      { key: "isReturnProduct", width: 15 },
      { key: "creditDays", width: 15 },
      { key: "dueDate", width: 15 },
      { key: "deliveryDate", width: 20 },
      { key: "paidAmount", width: 15 },
      { key: "dueAmount", width: 15 },
      { key: "totalAmount", width: 15 },
      { key: "paymentStatus", width: 15 },
      { key: "remark", width: 20 },
      { key: "isExchange", width: 15 },
      { key: "isReturn", width: 15 },
    ];

    const headerRow = worksheet.getRow(3);
    headerRow.values = [
      "No",
      "Recording Date",
      "Invoice Number",
      "Invoice Date",
      "MR Name",
      "Customer Code",
      "Customer Name",
      "Customer Number",
      "Address",
      "Zone",
      "Product Name",
      "Sales Qty",
      "Bonus Qty",
      "Total Qty",
      "Selling Price",
      "Amount",
      "Discount",
      "Net Selling Amount",
      "Average Unit Price",
      "LC",
      "Profit/Loss",
      "Product Accept",
      "Exchange Product",
      "Return Product",
      "Credit Days",
      "Due Date",
      "Delivery Date",
      "Paid Amount",
      "Due Amount",
      "Total Amount",
      "Payment Status",
      "Remark",
      "Is Exchange",
      "Is Return",
    ];
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    ["recordingDate", "invoiceDate", "dueDate", "deliveryDate"].forEach(
      (key) => {
        const col = worksheet.getColumn(key);
        if (col) col.numFmt = "dd-mmm-yy";
      }
    );

    [
      "salesQty",
      "bonusQty",
      "totalQty",
      "sellingPrice",
      "amount",
      "discount",
      "netSellingAmount",
      "averageUnitPrice",
      "lc",
      "profitLoss",
      "paidAmount",
      "dueAmount",
      "totalAmount",
    ].forEach((key) => {
      const col = worksheet.getColumn(key);
      if (col) col.numFmt = "#,##0.00";
    });

    let rowIndex = 0;
    filteredSalesData.forEach((sale) => {
      const customer = customerMap[sale.customerId?.toString()] || {};

      const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
      };

      const formatCustomerCode = (code) =>
        code ? code.toString().padStart(4, "0") : "";

      sale.products.forEach((product) => {
        const row = worksheet.addRow({
          no: ++rowIndex,
          recordingDate: formatDate(sale.recordingDate),
          invoiceNumber: sale.invoiceNumber,
          invoiceDate: formatDate(sale.invoiceDate),
          mrName: sale.mrName,
          customerCode: formatCustomerCode(customer.customerCode),
          customerName: customer.name || "--",
          customerNumber: customer.customerNumber || "--",
          address: customer.address || "--",
          zone: customer.zone || "--",
          productName: product.productName,
          salesQty: product.salesQty,
          bonusQty: product.bonusQty,
          totalQty: product.totalQty,
          sellingPrice: product.sellingPrice,
          amount: product.amount,
          discount: product.discount,
          netSellingAmount: product.netSellingAmount,
          averageUnitPrice: product.averageUnitPrice,
          lc: product.lc,
          profitLoss: product.profitLoss,
          isProductAccept: product.isProductAccept ? "Yes" : "No",
          isExchangeProduct: product.isExchangeProduct ? "Yes" : "No",
          isReturnProduct: product.isReturnProduct ? "Yes" : "No",
          creditDays: sale.creditDays,
          dueDate: formatDate(sale.dueDate),
          deliveryDate: formatDate(sale.recordingDate),
          paidAmount: sale.paidAmount,
          dueAmount: sale.dueAmount,
          totalAmount: sale.totalAmount,
          paymentStatus: sale.paymentStatus,
          remark: sale.remark,
          isExchange: sale.isExchange ? "Yes" : "No",
          isReturn: sale.isReturn ? "Yes" : "No",
        });

        // Color transactions differently
        if (sale.isReturn) {
          // Light red background for returns
          row.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFDE7E7" },
            };
          });
        } else if (sale.isExchange) {
          // Light blue background for exchanges
          row.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFE6F3FF" },
            };
          });
        }

        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      });
    });

    const fileName = `sale_summary_${formatDateToReadable(
      startDate
    )}_to_${formatDateToReadable(endDate)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating Excel file:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel file",
      error: error.message,
    });
  }
});

// ============================================================================
// 🔧 UTILITY ENDPOINTS
// ============================================================================

router.get("/sales/payment-status", async (req, res) => {
  try {
    const statuses = await PaymentStatus.find().sort({ type: 1 }); // Fixed: Changed to PaymentStatus
    res.status(200).json(statuses);
  } catch (error) {
    console.error("❌ Error fetching payment statuses:", error.message);
    res.status(500).json({ error: "Failed to fetch payment statuses." });
  }
});

router.get("/sales/unique-names", async (req, res) => {
  try {
    const uniqueNames = await Product.distinct("productName", {
      productName: { $ne: null },
    });

    uniqueNames.sort((a, b) => a.localeCompare(b));

    res.status(200).json({ productNames: uniqueNames });
  } catch (error) {
    console.error("Error fetching unique product names:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sales/stock/report-in-hand", async (req, res) => {
  try {
    const reports = await ReportInHand.find({});
    res.json(reports);
  } catch (error) {
    console.error("Error fetching report in hand:", error);
    res.status(500).json({ error: "Failed to fetch report in hand data." });
  }
});

// 🔥 MODIFIED: BATCH DELETE ENDPOINT WITH RETURN SUPPORT
router.post("/sales/delete-batch", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No sale IDs provided",
      });
    }

    const deletedSales = [];
    const errors = [];

    // Process in smaller batches
    const batchSize = 10;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);

      const batchPromises = batch.map(async (id) => {
        try {
          const saleToDelete = await SaleSummary.findById(id);

          if (!saleToDelete) {
            errors.push({ id, error: "Not found" });
            return;
          }

          // Restore inventory for all products
          for (const product of saleToDelete.products) {
            const totalQty = product.salesQty + product.bonusQty;
            if (totalQty !== 0) {
              await restoreReportInHandAfterSaleDeletion(
                product.productName,
                product.salesQty,
                product.bonusQty,
                saleToDelete.isExchange,
                saleToDelete.remark,
                saleToDelete.paymentStatus
              );
            }
          }

          // Delete the sale
          await SaleSummary.findByIdAndDelete(id);

          deletedSales.push({
            id,
            invoiceNumber: saleToDelete.invoiceNumber,
            customerName: saleToDelete.customerName,
            isExchange: saleToDelete.isExchange,
            isReturn: saleToDelete.isReturn,
          });
        } catch (error) {
          errors.push({
            id,
            error: error.message,
          });
        }
      });

      await Promise.allSettled(batchPromises);
    }

    res.json({
      success: true,
      deletedCount: deletedSales.length,
      deletedSales,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully deleted ${deletedSales.length} sales and restored inventory`,
    });
  } catch (error) {
    console.error("Batch delete error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete sales",
      error: error.message,
    });
  }
});

// 🔥 NEW UTILITY FUNCTION TO CHECK INVENTORY CHANGES (Optional - for debugging)
router.get("/sales/inventory-check/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const sale = await SaleSummary.findById(id);

    if (!sale) {
      return res.status(404).json({ error: "Sale not found" });
    }

    const inventoryChecks = await Promise.all(
      sale.products.map(async (product) => {
        const existingProduct = await findProductInInventory(
          product.productName
        );

        return {
          productName: product.productName,
          saleQty: product.totalQty,
          currentStock:
            existingProduct?.totalBoxes ||
            existingProduct?.currentStock ||
            existingProduct?.boxes ||
            0,
          hasStock: existingProduct ? "Yes" : "No",
          productId: existingProduct?._id,
          isExchangeProduct: product.isExchangeProduct,
          isReturnProduct: product.isReturnProduct,
          transactionType: sale.isReturn
            ? "Return"
            : sale.isExchange
            ? "Exchange"
            : "Sale",
        };
      })
    );

    res.json({
      saleId: id,
      invoiceNumber: sale.invoiceNumber,
      isExchange: sale.isExchange,
      isReturn: sale.isReturn,
      inventoryChecks,
    });
  } catch (error) {
    console.error("Inventory check error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 🔥 NEW ENDPOINT TO GET EXCHANGE TRANSACTIONS
router.get("/sales/exchange-transactions", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const matchConditions = { isExchange: true };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    const exchangeTransactions = await SaleSummary.find(matchConditions)
      .sort({ invoiceDate: -1 })
      .select({
        invoiceNumber: 1,
        invoiceDate: 1,
        customerName: 1,
        mrName: 1,
        totalAmount: 1,
        paymentStatus: 1,
        remark: 1,
        products: 1,
        isExchange: 1,
        isReturn: 1,
      });

    res.json({
      success: true,
      data: exchangeTransactions,
      count: exchangeTransactions.length,
    });
  } catch (error) {
    console.error("Error fetching exchange transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch exchange transactions",
      error: error.message,
    });
  }
});

// 🔥 NEW ENDPOINT TO GET RETURN TRANSACTIONS
router.get("/sales/return-transactions", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const matchConditions = { isReturn: true };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    const returnTransactions = await SaleSummary.find(matchConditions)
      .sort({ invoiceDate: -1 })
      .select({
        invoiceNumber: 1,
        invoiceDate: 1,
        customerName: 1,
        mrName: 1,
        totalAmount: 1,
        paymentStatus: 1,
        remark: 1,
        products: 1,
        isReturn: 1,
        isExchange: 1,
      });

    res.json({
      success: true,
      data: returnTransactions,
      count: returnTransactions.length,
    });
  } catch (error) {
    console.error("Error fetching return transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch return transactions",
      error: error.message,
    });
  }
});

// 🔥 NEW ENDPOINT TO GET ALL TRANSACTIONS BY TYPE
router.get("/sales/transactions-by-type", async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;

    let matchConditions = {};

    if (type === "return") {
      matchConditions.isReturn = true;
    } else if (type === "exchange") {
      matchConditions.isExchange = true;
    } else if (type === "sale") {
      matchConditions.$and = [
        { isReturn: { $ne: true } },
        { isExchange: { $ne: true } },
      ];
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    const transactions = await SaleSummary.find(matchConditions)
      .sort({ invoiceDate: -1 })
      .select({
        invoiceNumber: 1,
        invoiceDate: 1,
        customerName: 1,
        mrName: 1,
        totalAmount: 1,
        paymentStatus: 1,
        remark: 1,
        products: 1,
        isReturn: 1,
        isExchange: 1,
      });

    res.json({
      success: true,
      data: transactions,
      count: transactions.length,
      type: type || "all",
    });
  } catch (error) {
    console.error("Error fetching transactions by type:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: error.message,
    });
  }
});

// 🔥 ADDED: Endpoint to get failed invoices for a session
router.get("/import/failed-invoices/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!importProgressMap.has(sessionId)) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const progress = importProgressMap.get(sessionId);
    const errors = progress.errors || [];

    // Format errors for download
    const failedInvoices = errors.map((error, index) => ({
      row: index + 1,
      invoiceNumber: error.invoiceNumber || `Error-${index}`,
      customerName: error.customerName || "Unknown",
      error: error.error || "Unknown error",
      type: error.type || "import_error",
      products: error.products || [],
      timestamp: error.timestamp || new Date().toISOString(),
    }));

    res.json({
      success: true,
      failedInvoices,
      count: failedInvoices.length,
      sessionId,
    });
  } catch (error) {
    console.error("Error fetching failed invoices:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching failed invoices",
      error: error.message,
    });
  }
});

// 🔥 NEW: Debug endpoint for product matching
router.get("/debug/product-match/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const normalized = normalizeProductName(productName);

    // Search in ReportInHand
    const reportProducts = await ReportInHand.find({
      productName: { $regex: productName, $options: "i" },
    });

    // Search with enhanced finder
    const foundProduct = await findProductInInventory(productName);

    res.json({
      searchTerm: productName,
      normalizedTerm: normalized,
      fixedName: productNameFixMap[normalized] || "Not in fix map",
      reportInHandMatches: reportProducts.map((p) => ({
        id: p._id,
        productName: p.productName,
        totalBoxes:
          p.totalBoxes ||
          p.batches?.reduce((sum, b) => sum + (b.boxes || 0), 0) ||
          0,
        supplierName: p.supplierName,
      })),
      foundByEnhancedFinder: foundProduct
        ? {
            id: foundProduct._id,
            productName: foundProduct.productName,
            totalBoxes:
              foundProduct.totalBoxes ||
              foundProduct.batches?.reduce(
                (sum, b) => sum + (b.boxes || 0),
                0
              ) ||
              0,
            supplierName: foundProduct.supplierName,
          }
        : null,
      allProductsInInventory: (await ReportInHand.find({}))
        .map((p) => p.productName)
        .slice(0, 20), // First 20 products
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add this temporary debug endpoint
router.get("/import/debug/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const progress = importProgressMap.get(sessionId);

    if (!progress) {
      return res.json({ error: "Session not found" });
    }

    // Get detailed error samples
    const sampleErrors = progress.errors.slice(0, 20);
    const errorPatterns = {};

    sampleErrors.forEach((error) => {
      const key = error.error?.split(":")[0] || "Unknown";
      errorPatterns[key] = (errorPatterns[key] || 0) + 1;
    });

    res.json({
      totalErrors: progress.errors.length,
      errorPatterns,
      sampleErrors,
      progressDetails: {
        totalInvoices: progress.totalInvoices,
        successful: progress.successful,
        failed: progress.failed,
        progressPercentage: progress.progressPercentage,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 ADD THESE DEBUG ENDPOINTS TO YOUR ROUTER:

// Debug endpoint to check current import data structure
router.post("/debug/check-import-data", async (req, res) => {
  try {
    const salesData = req.body;

    // Log the structure
    console.log("=== DEBUG: Import Data Structure ===");
    console.log(
      "Total records:",
      Array.isArray(salesData) ? salesData.length : "Not an array"
    );

    if (Array.isArray(salesData) && salesData.length > 0) {
      const sample = salesData[0];
      console.log("Sample record keys:", Object.keys(sample));
      console.log("Sample MR Name:", sample.mrName);
      console.log("Sample Customer Name:", sample.customerName);
      console.log("Sample Invoice Number:", sample.invoiceNumber);
      console.log(
        "Sample Products count:",
        Array.isArray(sample.products) ? sample.products.length : "Not an array"
      );

      if (Array.isArray(sample.products) && sample.products.length > 0) {
        console.log("Sample product:", sample.products[0]);
      }
    }

    // Try to validate with existing function
    const validationResult = await validateImportData(
      Array.isArray(salesData) ? salesData : []
    );

    res.json({
      success: true,
      dataStructure: {
        isArray: Array.isArray(salesData),
        count: Array.isArray(salesData) ? salesData.length : 0,
        sampleKeys:
          Array.isArray(salesData) && salesData.length > 0
            ? Object.keys(salesData[0])
            : [],
      },
      validationResult,
      message: "Check console for detailed logs",
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to create a single sale

const logError = (error, context = "") => {
  console.error(`❌ ${context} Error:`, error.message);
  console.error("Error stack:", error.stack);
  if (error.errors) {
    Object.keys(error.errors).forEach((key) => {
      console.error(`Field error ${key}:`, error.errors[key].message);
    });
  }
};

// Wrap your main endpoints with better error handling
const wrapAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      logError(error, `${req.method} ${req.path}`);
      next(error);
    });
  };
};
// Check database collections
router.get("/debug/check-collections", async (req, res) => {
  try {
    const saleCount = await SaleSummary.countDocuments();
    const mrcashCount = await MRCash.countDocuments();
    const staffCount = await Staff.countDocuments();
    const customerCount = await Customer.countDocuments();
    const reportInHandCount = await ReportInHand.countDocuments();

    // Get sample data
    const sampleSale = await SaleSummary.findOne().limit(1);
    const sampleMRCASH = await MRCash.findOne().limit(1);

    res.json({
      success: true,
      collections: {
        SaleSummary: saleCount,
        MRCashes: mrcashCount,
        Staff: staffCount,
        Customer: customerCount,
        ReportInHand: reportInHandCount,
      },
      sampleSale: sampleSale
        ? {
            _id: sampleSale._id,
            invoiceNumber: sampleSale.invoiceNumber,
            mrName: sampleSale.mrName,
            mrId: sampleSale.mrId,
            createdAt: sampleSale.createdAt,
          }
        : null,
      sampleMRCASH: sampleMRCASH
        ? {
            _id: sampleMRCASH._id,
            mrName: sampleMRCASH.mrName,
            mrId: sampleMRCASH.mrId,
            currentCash: sampleMRCASH.currentCash,
            createdAt: sampleMRCASH.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Check collections error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Export the router and utility functions
export {
  router as saleRouter,
  importProgressMap,
  initializeImportProgress,
  updateImportProgress,
  processImportAsync,
  validateImportData,
  findProductInInventory,
  normalizeProductName,
  mapPaymentStatus,
  parseDateString,
  isReturnTransaction,
  updateReportInHandAfterSale,
  addCashToMR,
  removeCashFromMR,
  restoreReportInHandAfterSaleDeletion,
  checkInvoiceNumberExists,
  parseQuantityWithParenthesis,
};

export default router;
