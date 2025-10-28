import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import paymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
import customer from "../../models/master/customer.js";
import ExcelJS from "exceljs";
import SalesReturn from "../../models/sale/saleReturn.js";
import ReportInHand from "../../models/reports/reportsInHand.js";

const router = express.Router();

// 🔧 Convert Excel serial date to JS Date
const excelDateToJSDate = (serial) => {
  if (typeof serial === "number") {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    return new Date(utc_value * 1000);
  }

  const parsed = new Date(serial);
  return !isNaN(parsed) ? parsed : null;
};

const formatDateToReadable = (isoString) => {
  if (!isoString) return "";

  const date = new Date(isoString);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

// Function to update ReportInHand inventory after sale
const updateReportInHandAfterSale = async (productName, salesQty, bonusQty) => {
  try {
    const totalQtyToDeduct = salesQty + bonusQty;

    if (totalQtyToDeduct <= 0) return;

    // Find the product in ReportInHand
    const existingProduct = await ReportInHand.findOne({
      productName: productName,
    });

    if (!existingProduct) {
      console.warn(
        `⚠️ Product "${productName}" not found in ReportInHand inventory`
      );
      return 0; // Return 0 as LC value
    }

    // Check if there's enough stock
    if (existingProduct.quantity.totalPieces < totalQtyToDeduct) {
      throw new Error(
        `Insufficient stock for product "${productName}". Available: ${existingProduct.quantity.totalPieces}, Required: ${totalQtyToDeduct}`
      );
    }

    // Calculate how many boxes and pieces to deduct
    const piecesPerBox = existingProduct.quantity.piecesPerBox || 1;
    let remainingPiecesToDeduct = totalQtyToDeduct;

    // Calculate boxes to deduct
    const boxesToDeduct = Math.floor(remainingPiecesToDeduct / piecesPerBox);
    remainingPiecesToDeduct -= boxesToDeduct * piecesPerBox;

    // Update the inventory
    const updatedBoxes = existingProduct.quantity.boxes - boxesToDeduct;
    const updatedTotalPieces =
      existingProduct.quantity.totalPieces - totalQtyToDeduct;

    // Update status based on new total quantity
    let updatedStatus = "In Stock";
    if (updatedTotalPieces === 0) {
      updatedStatus = "Out of Stock";
    } else if (updatedTotalPieces < 10) {
      updatedStatus = "Critical";
    } else if (updatedTotalPieces < 25) {
      updatedStatus = "Low Stock";
    }

    await ReportInHand.findByIdAndUpdate(existingProduct._id, {
      $set: {
        "quantity.boxes": updatedBoxes,
        "quantity.totalPieces": updatedTotalPieces,
        status: updatedStatus,
      },
    });

    return existingProduct.lc || 0;
  } catch (error) {
    console.error(
      `❌ Error updating ReportInHand for product "${productName}":`,
      error.message
    );
    throw error;
  }
};

const restoreReportInHandAfterSaleDeletion = async (
  productName,
  salesQty,
  bonusQty
) => {
  try {
    const totalQtyToRestore = salesQty + bonusQty;

    if (totalQtyToRestore <= 0) return;

    const existingProduct = await ReportInHand.findOne({
      productName: productName,
    });

    if (!existingProduct) {
      console.warn(
        `⚠️ Product "${productName}" not found in ReportInHand inventory during restoration`
      );
      return;
    }

    const piecesPerBox = existingProduct.quantity.piecesPerBox || 1;
    let remainingPiecesToRestore = totalQtyToRestore;

    // Calculate boxes to restore
    const boxesToRestore = Math.floor(remainingPiecesToRestore / piecesPerBox);
    remainingPiecesToRestore -= boxesToRestore * piecesPerBox;

    const updatedBoxes = existingProduct.quantity.boxes + boxesToRestore;
    const updatedTotalPieces =
      existingProduct.quantity.totalPieces + totalQtyToRestore;

    // Update status based on new total quantity
    let updatedStatus = "In Stock";
    if (updatedTotalPieces === 0) {
      updatedStatus = "Out of Stock";
    } else if (updatedTotalPieces < 10) {
      updatedStatus = "Critical";
    } else if (updatedTotalPieces < 25) {
      updatedStatus = "Low Stock";
    }

    await ReportInHand.findByIdAndUpdate(existingProduct._id, {
      $set: {
        "quantity.boxes": updatedBoxes,
        "quantity.totalPieces": updatedTotalPieces,
        status: updatedStatus,
      },
    });
  } catch (error) {
    console.error(
      `❌ Error restoring ReportInHand for product "${productName}":`,
      error.message
    );
    throw error;
  }
};

router.post("/sale/import", async (req, res) => {
  try {
    const parsedData = req.body;

    if (!Array.isArray(parsedData) || parsedData.length === 0) {
      return res.status(400).json({ message: "No data provided for import." });
    }

    const validDocs = [];
    const skippedRows = [];

    const parseExcelDate = (value) => {
      if (!value || isNaN(value)) return null;
      const date = new Date(Math.round((value - 25569) * 86400 * 1000));
      return isNaN(date.getTime()) ? null : date;
    };

    parsedData.forEach((item, index) => {
      const rowNumber = index + 2;

      const invoiceDate = parseExcelDate(Number(item.invoiceDate));
      const recordingDate = parseExcelDate(Number(item.recordingDate));
      const deliveryDate = invoiceDate;

      const addSkip = (reason) => {
        skippedRows.push({ row: rowNumber, reason, data: item });
      };

      // === Validations ===
      if (
        !item.mrName ||
        typeof item.mrName !== "string" ||
        item.mrName.trim() === ""
      ) {
        return addSkip("Missing or invalid 'mrName'");
      }

      if (!item.customerCode || isNaN(Number(item.customerCode))) {
        return addSkip("Missing or invalid 'customerCode'");
      }

      if (!invoiceDate) {
        return addSkip("Missing or invalid 'invoiceDate'");
      }

      // === Conversions and calculations ===
      const salesQty = Number(item.salesQty) || 0;
      const bonusQty = Number(item.bonusQty) || 0;
      const totalQty = salesQty + bonusQty;
      const sellingPrice = Number(item.sellingPrice) || 0;
      const discount = Number(item.discount) || 0;
      const paidAmount = Number(item.paidAmount) || 0;

      const amount = salesQty * sellingPrice;
      const netSellingAmount = amount - discount;
      const averageUnitPrice = totalQty > 0 ? netSellingAmount / totalQty : 0;

      // LC will be fetched from ReportInHand during inventory update
      const lc = 0; // Placeholder, will be updated after inventory update

      const profitLoss = netSellingAmount - totalQty * lc;
      const dueAmount = netSellingAmount - paidAmount;

      // Parse creditDays & dueDate
      const creditDays =
        item.creditDays !== "" ? Number(item.creditDays) : null;
      const dueDate =
        creditDays !== null && !isNaN(creditDays)
          ? new Date(Date.now() + creditDays * 86400000)
          : null;

      validDocs.push({
        recordingDate,
        invoiceNumber: item.invoiceNumber || "",
        invoiceDate,
        mrName: item.mrName.trim(),
        customerCode: Number(item.customerCode),
        productName: item.productName || "",
        salesQty,
        bonusQty,
        totalQty,
        sellingPrice,
        amount,
        discount,
        netSellingAmount,
        lc, // Will be updated after inventory update
        averageUnitPrice,
        profitLoss, // Will be recalculated after LC is set
        creditDays,
        dueDate,
        deliveryDate,
        paymentStatus: item.paymentStatus || "Pending",
        paidAmount,
        dueAmount,
        remark: item.remark || "",
      });
    });

    if (validDocs.length === 0) {
      return res.status(400).json({
        message: "❌ No valid rows to import. Please check required fields.",
        skippedRows,
      });
    }

    // Insert sales records and update inventory
    const insertedSales = [];
    const inventoryUpdates = [];

    for (const saleData of validDocs) {
      if (saleData.salesQty > 0 || saleData.bonusQty > 0) {
        try {
          // Update inventory and get LC value
          const lcValue = await updateReportInHandAfterSale(
            saleData.productName,
            saleData.salesQty,
            saleData.bonusQty
          );

          // Update sale data with actual LC and recalculate profit/loss
          saleData.lc = lcValue || 0;
          saleData.profitLoss =
            saleData.netSellingAmount - saleData.totalQty * saleData.lc;

          const insertedSale = await SaleSummary.create(saleData);
          insertedSales.push(insertedSale);

          inventoryUpdates.push({
            productName: saleData.productName,
            status: "success",
            deducted: saleData.salesQty + saleData.bonusQty,
            lc: lcValue,
          });
        } catch (error) {
          inventoryUpdates.push({
            productName: saleData.productName,
            status: "failed",
            error: error.message,
          });
          // Skip this sale record if inventory update fails
          continue;
        }
      } else {
        // Insert sale without inventory update
        const insertedSale = await SaleSummary.create(saleData);
        insertedSales.push(insertedSale);
      }
    }

    return res.status(200).json({
      message: `<b>${insertedSales.length}</b> sale summary records imported successfully.`,
      insertedCount: insertedSales.length,
      skippedCount: skippedRows.length,
      skippedRows,
      inventoryUpdates,
    });
  } catch (error) {
    console.error("❌ Error importing sale summary:", error);
    return res.status(500).json({ message: "Failed to import sale summary." });
  }
});

// Updated GET /sales endpoint with pagination support
router.get("/sales", async (req, res) => {
  try {
    const { page = 1, limit = 9, search = "", tab = "All" } = req.query;

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build match conditions for filtering
    const matchConditions = {};

    // Search filter
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { "customerInfo.name": searchRegex },
        { productName: searchRegex },
      ];
    }

    // Tab filter (payment status)
    if (tab && tab !== "All") {
      matchConditions.paymentStatus = new RegExp(`^${tab}$`, "i");
    }

    // Get total count for pagination
    const totalCountAggregate = await SaleSummary.aggregate([
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
        $match: matchConditions,
      },
      {
        $count: "totalCount",
      },
    ]);

    const totalCount =
      totalCountAggregate.length > 0 ? totalCountAggregate[0].totalCount : 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    // Get paginated data
    const summaries = await SaleSummary.aggregate([
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
        $match: matchConditions,
      },
      {
        $sort: {
          recordingDate: -1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limitNum,
      },
    ]);

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
    console.error(
      "❌ Error fetching sale summaries with customer info:",
      error
    );
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

// Keep the original endpoint for backward compatibility
router.get("/sales/all", async (req, res) => {
  try {
    const summaries = await SaleSummary.aggregate([
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
        $sort: {
          recordingDate: -1,
        },
      },
    ]);

    res.status(200).json(summaries);
  } catch (error) {
    console.error("❌ Error fetching all sale summaries:", error);
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

router.put("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Get original sale data
    const originalSale = await SaleSummary.findById(id);
    if (!originalSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    // Restore original inventory first
    if (originalSale.salesQty > 0 || originalSale.bonusQty > 0) {
      await restoreReportInHandAfterSaleDeletion(
        originalSale.productName,
        originalSale.salesQty,
        originalSale.bonusQty
      );
    }

    // Update the sale
    const updatedSale = await SaleSummary.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    // Update inventory with new quantities
    if (updatedSale.salesQty > 0 || updatedSale.bonusQty > 0) {
      const lcValue = await updateReportInHandAfterSale(
        updatedSale.productName,
        updatedSale.salesQty,
        updatedSale.bonusQty
      );

      // Update LC and profit/loss with actual values
      updatedSale.lc = lcValue;
      updatedSale.profitLoss =
        updatedSale.netSellingAmount - updatedSale.totalQty * lcValue;
      await updatedSale.save();
    }

    res.status(200).json(updatedSale);
  } catch (err) {
    console.error("Error updating sale:", err);
    res.status(500).json({ error: "Failed to update sales record." });
  }
});

router.delete("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const saleToDelete = await SaleSummary.findById(id);

    if (!saleToDelete) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    // ✅ Restore inventory before deleting the sale
    if (saleToDelete.salesQty > 0 || saleToDelete.bonusQty > 0) {
      await restoreReportInHandAfterSaleDeletion(
        saleToDelete.productName,
        saleToDelete.salesQty,
        saleToDelete.bonusQty
      );
    }

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

router.delete("/sales", async (req, res) => {
  try {
    let { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No sale IDs provided." });
    }

    if (typeof ids[0] === "object" && ids[0]?.id) {
      ids = ids.map((item) => item.id);
    }

    // Get sales data before deletion for inventory restoration
    const salesToDelete = await SaleSummary.find({ _id: { $in: ids } });

    // Restore inventory for all sales being deleted
    for (const sale of salesToDelete) {
      if (sale.salesQty > 0 || sale.bonusQty > 0) {
        try {
          await restoreReportInHandAfterSaleDeletion(
            sale.productName,
            sale.salesQty,
            sale.bonusQty
          );
        } catch (error) {
          console.error(
            `Failed to restore inventory for sale ${sale._id}:`,
            error
          );
        }
      }
    }

    const result = await SaleSummary.deleteMany({ _id: { $in: ids } });

    return res.status(200).json({
      message: `${result.deletedCount} sale(s) deleted successfully and inventory restored.`,
    });
  } catch (error) {
    console.error("Error deleting sales:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/sales", async (req, res) => {
  try {
    // Assuming req.body is an array of sale items, not a single object
    const rawSalesData = req.body;

    // Validate and convert each sale item
    const newSaleData = rawSalesData.map((item) => ({
      recordingDate: new Date(item.recordingDate),
      invoiceNumber: item.invoiceNumber,
      invoiceDate: new Date(item.invoiceDate),
      mrName: item.mrName,
      customerCode: item.customerCode,
      productName: item.productName,
      salesQty: Number(item.salesQty),
      bonusQty: Number(item.bonusQty) || 0,
      totalQty: Number(item.totalQty),
      sellingPrice: Number(item.sellingPrice),
      amount: Number(item.amount),
      discount: Number(item.discount) || 0,
      netSellingAmount: Number(item.netSellingAmount),
      averageUnitPrice: Number(item.averageUnitPrice),
      lc: Number(item.lc) || 0, // Will be updated with actual value
      profitLoss: Number(item.profitLoss) || 0, // Will be recalculated
      creditDays: item.creditDays ? Number(item.creditDays) : null,
      dueDate: item.dueDate ? new Date(item.dueDate) : null,
      deliveryDate: item.deliveryDate ? new Date(item.deliveryDate) : null,
      paidAmount: Number(item.paidAmount) || 0,
      dueAmount: Number(item.dueAmount) || 0,
      totalAmount: Number(item.totalAmount),
      paymentStatus: item.paymentStatus,
      remark: item.remark || "",
    }));

    // Insert sales records and update inventory
    const savedSales = [];
    const inventoryUpdates = [];

    for (const sale of newSaleData) {
      if (sale.salesQty > 0 || sale.bonusQty > 0) {
        try {
          // Update inventory and get LC value
          const lcValue = await updateReportInHandAfterSale(
            sale.productName,
            sale.salesQty,
            sale.bonusQty
          );

          // Update sale with actual LC and recalculate profit/loss
          sale.lc = lcValue;
          sale.profitLoss = sale.netSellingAmount - sale.totalQty * lcValue;

          const savedSale = await SaleSummary.create(sale);
          savedSales.push(savedSale);

          inventoryUpdates.push({
            productName: sale.productName,
            status: "success",
            deducted: sale.salesQty + sale.bonusQty,
            lc: lcValue,
          });
        } catch (error) {
          inventoryUpdates.push({
            productName: sale.productName,
            status: "failed",
            error: error.message,
          });
          // Skip this sale if inventory update fails
          continue;
        }
      } else {
        // Insert sale without inventory update
        const savedSale = await SaleSummary.create(sale);
        savedSales.push(savedSale);
      }
    }

    res.status(201).json({
      message: `Sales added successfully`,
      sales: savedSales,
      inventoryUpdates,
    });
  } catch (error) {
    console.error("Sale creation error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: "Failed to add new sale" });
  }
});

router.get("/sales/payment-status", async (req, res) => {
  try {
    const statuses = await paymentStatus.find().sort({ type: 1 });
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

    // ✅ Fetch filtered sales data from MongoDB
    const filteredSalesData = await SaleSummary.find({
      invoiceDate: {
        $gte: start,
        $lte: end,
      },
    }).sort({ invoiceDate: 1 });

    if (filteredSalesData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No sales data found for the selected date range",
      });
    }

    // ✅ Extract all unique customerCodes
    const customerCodes = [
      ...new Set(filteredSalesData.map((sale) => sale.customerCode)),
    ];

    // ✅ Fetch customer details for those codes
    const customers = await customer.find({
      customerCode: { $in: customerCodes },
    });

    // ✅ Create lookup map
    const customerMap = {};
    customers.forEach((cust) => {
      customerMap[cust.customerCode] = cust;
    });

    // ✅ Create Excel Workbook & Sheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sale Summary");

    // === Sheet Titles ===
    worksheet.mergeCells("A1:AB1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    worksheet.mergeCells("A2:AB2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = `Sale Summary List (${formatDateToReadable(
      startDate
    )} to ${formatDateToReadable(endDate)})`;
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 20;

    // === Define Columns ===
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
      { key: "creditDays", width: 15 },
      { key: "dueDate", width: 15 },
      { key: "deliveryDate", width: 20 },
      { key: "paidAmount", width: 15 },
      { key: "dueAmount", width: 15 },
      { key: "paymentStatus", width: 15 },
      { key: "remark", width: 20 },
    ];

    // === Header Row ===
    const headerRow = worksheet.getRow(3);
    headerRow.values = worksheet.columns.map((col) =>
      col.key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
    );
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    // === Format Columns ===
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
    ].forEach((key) => {
      const col = worksheet.getColumn(key);
      if (col) col.numFmt = "#,##0.00";
    });

    // === Add Data Rows ===
    filteredSalesData.forEach((sale, index) => {
      const customer = customerMap[sale.customerCode] || {};

      const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
      };

      const formatCustomerCode = (code) => {
        return code ? code.toString().padStart(5, "0") : "";
      };

      const row = worksheet.addRow({
        no: index + 1,
        recordingDate: formatDate(sale.recordingDate),
        invoiceNumber: sale.invoiceNumber,
        invoiceDate: formatDate(sale.invoiceDate),
        mrName: sale.mrName,
        customerCode: formatCustomerCode(sale.customerCode),
        customerName: customer.name || "",
        customerNumber: customer.customerNumber || "",
        address: customer.address || "",
        zone: customer.zone || "",
        productName: sale.productName,
        salesQty: sale.salesQty,
        bonusQty: sale.bonusQty,
        totalQty: sale.totalQty,
        sellingPrice: sale.sellingPrice,
        amount: sale.amount,
        discount: sale.discount,
        netSellingAmount: sale.netSellingAmount,
        averageUnitPrice: sale.averageUnitPrice,
        lc: sale.lc,
        profitLoss: sale.profitLoss,
        creditDays: sale.creditDays,
        dueDate: formatDate(sale.dueDate),
        deliveryDate: formatDate(sale.deliveryDate),
        paidAmount: sale.paidAmount,
        dueAmount: sale.dueAmount,
        paymentStatus: sale.paymentStatus,
        remark: sale.remark,
      });

      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
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

export default router;
