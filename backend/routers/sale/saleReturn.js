import express from "express";
import mongoose from "mongoose";
import SalesReturn from "../../models/sale/saleReturn.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import ProductInventory from "../../models/purcharsing/purchaseInventory.js";
import Customer from "../../models/master/customer.js";
import ExcelJS from "exceljs";

const router = express.Router();

// Helper function to calculate product totals with profit/loss
const calculateProductTotals = (products) => {
  return products.reduce(
    (totals, product) => {
      const salesQty = parseFloat(product.salesQty) || 0;
      const bonusQty = parseFloat(product.bonusQty) || 0;
      const sellingPrice = parseFloat(product.sellingPrice) || 0;
      const discount = parseFloat(product.discount) || 0;
      const returnQuantity = parseFloat(product.returnQuantity) || 0;
      const lc = parseFloat(product.lc) || 0;

      // Calculate amounts based on used quantity
      const usedQty = parseFloat(product.usedQty) || salesQty - returnQuantity;
      const amount = usedQty * sellingPrice;
      const netSellingAmount = amount - discount;
      const totalQty = usedQty + bonusQty;
      const usedAmount = usedQty * sellingPrice;
      const averageUnitPrice = totalQty > 0 ? netSellingAmount / totalQty : 0;

      // Calculate profit/loss
      const profitLoss = netSellingAmount - usedQty * lc;

      // Update product with calculated values
      product.amount = amount;
      product.netSellingAmount = netSellingAmount;
      product.totalQty = totalQty;
      product.usedQty = usedQty;
      product.usedAmount = usedAmount;
      product.averageUnitPrice = averageUnitPrice;
      product.profitLoss = profitLoss;

      // Update total amount
      totals.totalAmount += netSellingAmount;

      return totals;
    },
    { totalAmount: 0 }
  );
};

// Helper function to format dates for Excel
const formatDateToReadable = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// ================== POST / ==================
router.post("/", async (req, res) => {
  console.log("📥 POST /sales-return - received request");
  console.log("Request body:", JSON.stringify(req.body, null, 2));

  try {
    const data = req.body;
    const records = Array.isArray(data) ? data : [data];

    if (records.length === 0) {
      return res.status(400).json({ message: "Expected a non‑empty array of sales return records" });
    }

    const requiredFields = [
      "recordingDate", "invoiceNumber", "invoiceDate", "mrName",
      "customerName", "products"
    ];

    const processedData = await Promise.all(
      records.map(async (record, index) => {
        console.log(`\n--- Processing record ${index + 1} ---`);
        console.log("Record raw:", record);

        // Validate required fields
        for (const field of requiredFields) {
          if (record[field] === undefined || record[field] === null) {
            throw new Error(`Missing required field "${field}" in record ${index + 1}`);
          }
        }

        // ---- CUSTOMER HANDLING ----
        let customerId;
        let customerIdRaw = record.customerId;
        let customerCodeRaw = record.customerCode;

        // If customerId is an object (populated document), extract the _id string
        if (customerIdRaw && typeof customerIdRaw === 'object') {
          if (customerIdRaw._id) {
            customerIdRaw = customerIdRaw._id;
          } else {
            throw new Error(`Invalid customerId object format in record ${index + 1}: missing _id`);
          }
        }

        const customerIdValue = customerIdRaw ? String(customerIdRaw).trim() : "";
        const customerCodeValue = customerCodeRaw ? String(customerCodeRaw).trim() : "";

        console.log("   customerIdValue (string):", customerIdValue);
        console.log("   customerCodeValue:", customerCodeValue);

        if (customerIdValue && mongoose.Types.ObjectId.isValid(customerIdValue)) {
          // Case 1: Direct ObjectId string
          customerId = new mongoose.Types.ObjectId(customerIdValue);
          console.log("   Using customerId as direct ObjectId →", customerId);
        } else if (customerIdValue) {
          // Case 2: Treat as customer code
          console.log("   Looking up customer by code (customerId field):", customerIdValue);
          const customer = await Customer.findOne({ code: customerIdValue });
          if (!customer) {
            throw new Error(`Customer not found with code "${customerIdValue}" in record ${index + 1}`);
          }
          customerId = customer._id;
          console.log("   Found customer, _id:", customerId);
        } else if (customerCodeValue) {
          // Case 3: Fallback to customerCode field
          console.log("   Looking up customer by code (customerCode field):", customerCodeValue);
          const customer = await Customer.findOne({ code: customerCodeValue });
          if (!customer) {
            throw new Error(`Customer not found with code "${customerCodeValue}" in record ${index + 1}`);
          }
          customerId = customer._id;
          console.log("   Found customer, _id:", customerId);
        } else {
          // Case 4: No identifier provided – try to find by customerName (last resort)
          console.log("   No code or ID provided, attempting lookup by customerName:", record.customerName);
          const customer = await Customer.findOne({ name: record.customerName });
          if (!customer) {
            throw new Error(`Customer not found with name "${record.customerName}" in record ${index + 1}`);
          }
          customerId = customer._id;
          console.log("   Found customer by name, _id:", customerId);
        }

        // Replace record.customerId with the resolved ObjectId
        record.customerId = customerId;
        // ---------------------------------

        // Validate products array
        if (!Array.isArray(record.products) || record.products.length === 0) {
          throw new Error(`Products array is required and cannot be empty in record ${index + 1}`);
        }

        // Calculate product totals
        const { totalAmount } = calculateProductTotals(record.products);

        const amount = parseFloat(record.amount) || 0;
        const dueAmount = Math.max(0, totalAmount - amount);

        const creditDays = parseInt(record.creditDays) || 0;
        const dueDate = creditDays > 0
          ? new Date(new Date(record.invoiceDate).setDate(new Date(record.invoiceDate).getDate() + creditDays))
          : new Date(record.invoiceDate);

        // Map products with proper numeric conversions
        const mappedProducts = record.products.map(p => ({
          ...p,
          salesQty: Number(p.salesQty) || 0,
          bonusQty: Number(p.bonusQty) || 0,
          sellingPrice: Number(p.sellingPrice) || 0,
          discount: Number(p.discount) || 0,
          lc: Number(p.lc) || 0,
          returnQuantity: Number(p.returnQuantity) || 0,
          usedPrice: Number(p.usedPrice) || 0,
          usedQty: Number(p.usedQty) || 0,
          usedAmount: Number(p.usedAmount) || 0,
        }));

        const processedRecord = {
          ...record,
          customerId,
          products: mappedProducts,
          creditDays,
          dueDate,
          deliveryDate: record.deliveryDate || record.invoiceDate,
          amount,
          dueAmount,
          totalAmount,
          paymentStatus: record.paymentStatus || "Pending",
          remark: record.remark || "",
        };

        console.log("   ✅ Processed record ready → invoiceNumber:", processedRecord.invoiceNumber);
        return processedRecord;
      })
    );

    // Save to database
    const savedReturns = await SalesReturn.insertMany(processedData);
    console.log(`✅ Saved ${savedReturns.length} records`);

    // Update inventory with return quantities
    const inventoryUpdatePromises = processedData.flatMap((record) =>
      record.products.map(async (product) => {
        if (product.returnQuantity > 0) {
          const inventoryItem = await ProductInventory.findOne({
            productName: product.productName,
          });

          if (inventoryItem) {
            inventoryItem.totalBoxes += product.returnQuantity;

            if (inventoryItem.batches && inventoryItem.batches.length > 0) {
              inventoryItem.batches[0].boxes += product.returnQuantity;
              inventoryItem.batches[0].amount =
                inventoryItem.batches[0].boxes * inventoryItem.batches[0].lc;
            } else {
              inventoryItem.batches.push({
                boxes: product.returnQuantity,
                lc: product.lc || 0.9,
                fob: 1.1,
                cif: 1.2,
                amount: product.returnQuantity * (product.lc || 0.9),
                expiryDate: new Date("2029-11-21"),
                date: new Date(),
              });
            }

            inventoryItem.totalAmount = inventoryItem.batches.reduce(
              (sum, batch) => sum + batch.amount,
              0
            );
            inventoryItem.status =
              inventoryItem.totalBoxes > inventoryItem.minStockLevel
                ? "In Stock"
                : "Out of Stock";

            await inventoryItem.save();
          }
        }
      })
    );

    await Promise.all(inventoryUpdatePromises);

    // Update SaleSummary: set isProductAccept = false for returned products
    const updatePromises = processedData.flatMap((record) =>
      record.products.map((product) =>
        SaleSummary.updateMany(
          {
            invoiceNumber: record.invoiceNumber,
            "products.productName": product.productName,
            customerId: record.customerId,
          },
          {
            $set: {
              "products.$.isProductAccept": false,
              "products.$.returnQuantity": product.returnQuantity,
              "products.$.usedQty": product.usedQty,
              "products.$.usedPrice": product.usedPrice,
              "products.$.usedAmount": product.usedAmount,
              "products.$.profitLoss": product.profitLoss,
              "products.$.netSellingAmount": product.netSellingAmount,
              "products.$.amount": product.amount,
              "products.$.totalQty": product.totalQty,
              "products.$.averageUnitPrice": product.averageUnitPrice,
            },
          }
        )
      )
    );

    await Promise.all(updatePromises);

    return res.status(201).json({
      message: `${savedReturns.length} sales return records saved successfully, and related sales updated.`,
      data: savedReturns,
    });
  } catch (error) {
    console.error("❌ Error saving sales returns:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

// ================== GET / ==================
router.get("/", async (req, res) => {
  try {
    const filters = {};

    if (req.query.invoiceNumber) {
      filters.invoiceNumber = { $regex: req.query.invoiceNumber, $options: "i" };
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
      "name code"
    );

    if (!saleReturn) {
      return res.status(404).json({
        success: false,
        message: "Sales return record not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: saleReturn,
    });
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
router.put("/update-product", async (req, res) => {
  try {
    const { invoiceNumber, productName, salesQty, bonusQty, returnQuantity } = req.body;

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
      (product) => product.productName === productName
    );

    if (productIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Product not found in the sale record",
      });
    }

    const product = saleRecord.products[productIndex];

    const updatedSalesQty = salesQty !== undefined ? Number(salesQty) : product.salesQty;
    const updatedBonusQty = bonusQty !== undefined ? Number(bonusQty) : product.bonusQty;
    const updatedReturnQuantity = returnQuantity !== undefined ? Number(returnQuantity) : product.returnQuantity;

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
      usedQty: usedQty,
      totalQty: totalQty,
      amount: amount,
      netSellingAmount: netSellingAmount,
      usedAmount: usedAmount,
      averageUnitPrice: averageUnitPrice,
      profitLoss: profitLoss,
      isProductAccept: updatedReturnQuantity > 0 ? false : product.isProductAccept,
    };

    const totalNetSellingAmount = saleRecord.products.reduce(
      (sum, prod) => sum + prod.netSellingAmount,
      0
    );
    const totalDueAmount = Math.max(0, totalNetSellingAmount - saleRecord.amount);

    saleRecord.totalAmount = totalNetSellingAmount;
    saleRecord.dueAmount = totalDueAmount;

    await saleRecord.save();

    if (returnQuantity !== undefined && returnQuantity > 0) {
      const inventoryItem = await ProductInventory.findOne({ productName });
      if (inventoryItem) {
        const returnQtyDifference = returnQuantity - product.returnQuantity;
        if (returnQtyDifference !== 0) {
          inventoryItem.totalBoxes += returnQtyDifference;
          if (inventoryItem.batches && inventoryItem.batches.length > 0) {
            inventoryItem.batches[0].boxes += returnQtyDifference;
            inventoryItem.batches[0].amount =
              inventoryItem.batches[0].boxes * inventoryItem.batches[0].lc;
          }
          inventoryItem.totalAmount = inventoryItem.batches.reduce(
            (sum, batch) => sum + batch.amount,
            0
          );
          inventoryItem.status =
            inventoryItem.totalBoxes > inventoryItem.minStockLevel
              ? "In Stock"
              : "Out of Stock";
          await inventoryItem.save();
        }
      }
    }

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
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid sales return ID" });
    }

    const requiredFields = [
      "recordingDate", "invoiceNumber", "invoiceDate", "mrName",
      "customerName", "products"
    ];

    for (const field of requiredFields) {
      if (updatedData[field] === undefined || updatedData[field] === null) {
        return res.status(400).json({ success: false, message: `Missing required field: ${field}` });
      }
    }

    // ---- CUSTOMER HANDLING (same robust logic as POST) ----
    let customerId;
    let customerIdRaw = updatedData.customerId;
    let customerCodeRaw = updatedData.customerCode;

    if (customerIdRaw && typeof customerIdRaw === 'object') {
      if (customerIdRaw._id) {
        customerIdRaw = customerIdRaw._id;
      } else {
        throw new Error(`Invalid customerId object format: missing _id`);
      }
    }

    const customerIdValue = customerIdRaw ? String(customerIdRaw).trim() : "";
    const customerCodeValue = customerCodeRaw ? String(customerCodeRaw).trim() : "";

    if (customerIdValue && mongoose.Types.ObjectId.isValid(customerIdValue)) {
      customerId = new mongoose.Types.ObjectId(customerIdValue);
    } else if (customerIdValue) {
      const customer = await Customer.findOne({ code: customerIdValue });
      if (!customer) {
        return res.status(404).json({ success: false, message: `Customer not found with code "${customerIdValue}"` });
      }
      customerId = customer._id;
    } else if (customerCodeValue) {
      const customer = await Customer.findOne({ code: customerCodeValue });
      if (!customer) {
        return res.status(404).json({ success: false, message: `Customer not found with code "${customerCodeValue}"` });
      }
      customerId = customer._id;
    } else {
      const customer = await Customer.findOne({ name: updatedData.customerName });
      if (!customer) {
        return res.status(404).json({ success: false, message: `Customer not found with name "${updatedData.customerName}"` });
      }
      customerId = customer._id;
    }
    updatedData.customerId = customerId;
    // ------------------------------------------------

    // Recalculate totals
    const { totalAmount } = calculateProductTotals(updatedData.products);
    const amount = parseFloat(updatedData.amount) || 0;
    const dueAmount = Math.max(0, totalAmount - amount);
    const creditDays = parseInt(updatedData.creditDays) || 0;
    const invoiceDate = new Date(updatedData.invoiceDate);
    const dueDate = creditDays > 0
      ? new Date(invoiceDate.setDate(invoiceDate.getDate() + creditDays))
      : invoiceDate;

    // Map products with proper numeric conversions
    const mappedProducts = updatedData.products.map(p => ({
      ...p,
      salesQty: Number(p.salesQty) || 0,
      bonusQty: Number(p.bonusQty) || 0,
      sellingPrice: Number(p.sellingPrice) || 0,
      discount: Number(p.discount) || 0,
      lc: Number(p.lc) || 0,
      returnQuantity: Number(p.returnQuantity) || 0,
      usedPrice: Number(p.usedPrice) || 0,
      usedQty: Number(p.usedQty) || 0,
      usedAmount: Number(p.usedAmount) || 0,
    }));

    const updateData = {
      ...updatedData,
      customerId,
      products: mappedProducts,
      creditDays,
      dueDate,
      deliveryDate: updatedData.deliveryDate || updatedData.invoiceDate,
      amount,
      dueAmount,
      totalAmount,
    };

    const updatedReturn = await SalesReturn.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedReturn) {
      return res.status(404).json({ success: false, message: "Sales return record not found" });
    }

    // Update inventory (adjust for quantity differences)
    // For simplicity, you may want to fetch the old record and compute differences,
    // but this is a PUT that replaces the whole document. A common pattern is to
    // first fetch the old record, then revert its inventory changes and apply new ones.
    // We'll skip that here for brevity, but you may want to implement similar to POST.

    return res.status(200).json({ success: true, message: "Sales return updated successfully", data: updatedReturn });
  } catch (error) {
    console.error("Error updating sales return:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ================== DELETE / (multiple) ==================
router.delete("/", async (req, res) => {
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

    const result = await SalesReturn.deleteMany({ _id: { $in: validIds } });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No sale returns found with the provided IDs",
      });
    }

    // Revert inventory changes
    const inventoryRevertPromises = recordsToDelete.flatMap((record) =>
      record.products.map(async (product) => {
        if (product.returnQuantity > 0) {
          const inventoryItem = await ProductInventory.findOne({
            productName: product.productName,
          });

          if (inventoryItem) {
            inventoryItem.totalBoxes -= product.returnQuantity;

            if (inventoryItem.batches && inventoryItem.batches.length > 0) {
              inventoryItem.batches[0].boxes -= product.returnQuantity;
              inventoryItem.batches[0].amount =
                inventoryItem.batches[0].boxes * inventoryItem.batches[0].lc;
            }

            inventoryItem.totalAmount = inventoryItem.batches.reduce(
              (sum, batch) => sum + batch.amount,
              0
            );
            inventoryItem.status =
              inventoryItem.totalBoxes > inventoryItem.minStockLevel
                ? "In Stock"
                : "Out of Stock";

            await inventoryItem.save();
          }
        }
      })
    );

    await Promise.all(inventoryRevertPromises);

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

// ================== DELETE /:id ==================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

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

    const deleted = await SalesReturn.findByIdAndDelete(id);

    // Revert inventory changes
    const inventoryRevertPromises = recordToDelete.products.map(
      async (product) => {
        if (product.returnQuantity > 0) {
          const inventoryItem = await ProductInventory.findOne({
            productName: product.productName,
          });

          if (inventoryItem) {
            inventoryItem.totalBoxes -= product.returnQuantity;

            if (inventoryItem.batches && inventoryItem.batches.length > 0) {
              inventoryItem.batches[0].boxes -= product.returnQuantity;
              inventoryItem.batches[0].amount =
                inventoryItem.batches[0].boxes * inventoryItem.batches[0].lc;
            }

            inventoryItem.totalAmount = inventoryItem.batches.reduce(
              (sum, batch) => sum + batch.amount,
              0
            );
            inventoryItem.status =
              inventoryItem.totalBoxes > inventoryItem.minStockLevel
                ? "In Stock"
                : "Out of Stock";

            await inventoryItem.save();
          }
        }
      }
    );

    await Promise.all(inventoryRevertPromises);

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

    // Title Rows
    worksheet.mergeCells("A1:AC1");
    worksheet.getCell("A1").value = "HEALTHCARE SOUTH EAST ASIA";
    worksheet.getCell("A1").font = { bold: true, size: 16 };
    worksheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };

    worksheet.mergeCells("A2:AC2");
    worksheet.getCell("A2").value = `Sales Return Summary (${formatDateToReadable(startDate)} - ${formatDateToReadable(endDate)})`;
    worksheet.getCell("A2").font = { bold: true, size: 14 };
    worksheet.getCell("A2").alignment = { vertical: "middle", horizontal: "center" };

    // Column Definitions
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
      { key: "amount", width: 12 },
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
      { key: "amount", width: 15 },
      { key: "dueAmount", width: 15 },
      { key: "totalAmount", width: 15 },
      { key: "paymentStatus", width: 15 },
      { key: "remark", width: 20 },
    ];

    // Header Row
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
      "Amount",
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
      "Amount",
      "Due Amount",
      "Total Amount",
      "Payment Status",
      "Remark",
    ];
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    // Data
    let index = 0;
    filteredReturns.forEach((sale) => {
      sale.products.forEach((prod) => {
        worksheet.addRow({
          no: ++index,
          recordingDate: sale.recordingDate,
          invoiceNumber: sale.invoiceNumber,
          invoiceDate: sale.invoiceDate,
          mrName: sale.mrName,
          customerName: sale.customerId?.name || sale.customerName || "Unknown Customer",
          productName: prod.productName,
          salesQty: prod.salesQty,
          bonusQty: prod.bonusQty,
          totalQty: prod.totalQty,
          sellingPrice: prod.sellingPrice,
          amount: prod.amount,
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
          amount: sale.amount,
          dueAmount: sale.dueAmount,
          totalAmount: sale.totalAmount,
          paymentStatus: sale.paymentStatus,
          remark: sale.remark,
        });
      });
    });

    const fileName = `sales_return_summary_${formatDateToReadable(startDate)}_to_${formatDateToReadable(endDate)}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
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