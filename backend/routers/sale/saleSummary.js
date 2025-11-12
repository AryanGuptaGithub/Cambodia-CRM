import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import paymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
import ExcelJS from "exceljs";
import SalesReturn from "../../models/sale/saleReturn.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Customer from "../../models/master/customer.js";

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

// Function to update ReportInHand inventory after sale - CORRECTED VERSION
const updateReportInHandAfterSale = async (productName, salesQty, bonusQty) => {
  try {
    const totalQtyToDeduct = salesQty + bonusQty;

    if (totalQtyToDeduct <= 0) return 0;

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

    // Check if there's enough stock (using boxes field only)
    if (existingProduct.quantity.boxes < totalQtyToDeduct) {
      throw new Error(
        `Insufficient stock for product "${productName}". Available: ${existingProduct.quantity.boxes}, Required: ${totalQtyToDeduct}`
      );
    }

    // Update the inventory - only boxes field
    const updatedBoxes = existingProduct.quantity.boxes - totalQtyToDeduct;

    // Update status based on new boxes quantity (using the same logic as your model's pre-save)
    let updatedStatus = "In Stock";
    if (updatedBoxes === 0) {
      updatedStatus = "Out of Stock";
    } else if (updatedBoxes < 5) {
      updatedStatus = "Critical";
    } else if (updatedBoxes < 15) {
      updatedStatus = "Low Stock";
    }

    await ReportInHand.findByIdAndUpdate(existingProduct._id, {
      $set: {
        "quantity.boxes": updatedBoxes,
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
      return;
    }

    // Update the inventory - only boxes field
    const updatedBoxes = existingProduct.quantity.boxes + totalQtyToRestore;

    // Update status based on new boxes quantity
    let updatedStatus = "In Stock";
    if (updatedBoxes === 0) {
      updatedStatus = "Out of Stock";
    } else if (updatedBoxes < 5) {
      updatedStatus = "Critical";
    } else if (updatedBoxes < 15) {
      updatedStatus = "Low Stock";
    }

    await ReportInHand.findByIdAndUpdate(existingProduct._id, {
      $set: {
        "quantity.boxes": updatedBoxes,
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

// Function to check if invoice number already exists
const checkInvoiceNumberExists = async (invoiceNumber, excludeId = null) => {
  const query = { invoiceNumber: invoiceNumber };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existingSale = await SaleSummary.findOne(query);
  return !!existingSale;
};

// ==================== PRODUCT-WISE SALES ENDPOINT ====================
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

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build match conditions for filtering
    const matchConditions = {};

    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // End of the day

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        matchConditions.recordingDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    // Product name filter
    if (productName && productName.trim() !== "") {
      matchConditions["products.productName"] = new RegExp(
        productName.trim(),
        "i"
      );
    }

    // Search filter (for general search across multiple fields)
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { mrName: searchRegex },
        { customerCode: searchRegex },
        { "products.productName": searchRegex },
      ];
    }

    // Aggregate pipeline for product-wise sales
    const productWiseAggregate = await SaleSummary.aggregate([
      // Match documents based on filters
      { $match: matchConditions },

      // Unwind the products array to get each product as a separate document
      { $unwind: "$products" },

      // Lookup customer information
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },

      // Unwind customer info (there should be only one customer per code)
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Group by product to get summary (for total count)
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

      // Count total unique products for pagination
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          products: { $push: "$$ROOT" },
        },
      },
    ]);

    // Get total count and products
    let totalProducts = 0;
    let productSummary = [];

    if (productWiseAggregate.length > 0) {
      totalProducts = productWiseAggregate[0].totalProducts;
      productSummary = productWiseAggregate[0].products;
    }

    // Apply pagination to product summary
    const paginatedProducts = productSummary.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalProducts / limitNum);

    // Now get detailed records for the paginated products
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

      // Combine summary with detailed records
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
          .slice(0, 100), // Limit details to 100 records per product
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

// ==================== GET SINGLE PRODUCT SALES DETAILS ====================
router.get("/sales/product/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const { page = 1, limit = 10, startDate, endDate } = req.query;

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build match conditions
    const matchConditions = {
      "products.productName": decodeURIComponent(productName),
    };

    // Date range filter
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

    // Get total count
    const totalCount = await SaleSummary.countDocuments(matchConditions);

    // Get paginated sales data for this product
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

    // Calculate summary for this product
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

// Updated POST /sales endpoint to handle array of products with invoice number validation
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

    // ✅ Check if invoice number already exists
    const invoiceExists = await checkInvoiceNumberExists(
      saleData.invoiceNumber
    );
    if (invoiceExists) {
      return res.status(400).json({
        error: `Invoice number "${saleData.invoiceNumber}" already exists. Please use a different invoice number.`,
      });
    }

    // 🧩 Fetch customer name if missing but customerId is provided
    let customerName = saleData.customerName;
    if ((!customerName || customerName.trim() === "") && saleData.customerId) {
      const customer = await Customer.findById(saleData.customerId).select(
        "customerName"
      );

      if (customer) {
        customerName = customer?.name;
      } else {
        return res.status(400).json({
          error: `Customer not found for ID: ${saleData.customerId}`,
        });
      }
    }

    if (!customerName) {
      return res.status(400).json({
        error: "Missing customerName and no valid customerId provided",
      });
    }

    // 🧮 Calculate totals
    const totalAmount = saleData.products.reduce(
      (total, product) => total + (parseFloat(product.netSellingAmount) || 0),
      0
    );

    const paidAmount = parseFloat(saleData.paidAmount) || 0;
    const dueAmount = totalAmount - paidAmount;

    // ✅ Construct sale object
    const newSaleData = {
      recordingDate: new Date(saleData.recordingDate),
      invoiceNumber: saleData.invoiceNumber,
      invoiceDate: new Date(saleData.invoiceDate),
      mrName: saleData.mrName,
      mrId: saleData.mrId || "",
      customerName, // ✅ fetched or provided
      customerCode: saleData.customerCode,
      customerId: saleData.customerId || "",
      products: saleData.products.map((product) => ({
        productName: product.productName,
        salesQty: Number(product.salesQty),
        bonusQty: Number(product.bonusQty) || 0,
        totalQty: Number(product.totalQty),
        sellingPrice: Number(product.sellingPrice),
        amount: Number(product.amount),
        discount: Number(product.discount) || 0,
        netSellingAmount: Number(product.netSellingAmount),
        averageUnitPrice: Number(product.averageUnitPrice),
        lc: Number(product.lc) || 0,
        profitLoss: Number(product.profitLoss) || 0,
        isProductAccept:
          product.isProductAccept !== undefined
            ? product.isProductAccept
            : true,
      })),
      creditDays: saleData.creditDays ? Number(saleData.creditDays) : 0,
      dueDate: saleData.dueDate ? new Date(saleData.dueDate) : null,
      deliveryDate: saleData.deliveryDate
        ? new Date(saleData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      paymentStatus: saleData.paymentStatus || "Credit",
      remark: saleData.remark || saleData.remarks || "",
    };

    // 🔁 Update inventory for each product
    const inventoryUpdates = [];
    for (const product of newSaleData.products) {
      if (product.salesQty > 0 || product.bonusQty > 0) {
        try {
          const lcValue = await updateReportInHandAfterSale(
            product.productName,
            product.salesQty,
            product.bonusQty
          );

          product.lc = lcValue;
          product.profitLoss =
            product.netSellingAmount - product.totalQty * lcValue;

          inventoryUpdates.push({
            productName: product.productName,
            status: "success",
            deducted: product.salesQty + product.bonusQty,
            lc: lcValue,
          });
        } catch (error) {
          return res.status(400).json({
            error: `Inventory update failed for ${product.productName}: ${error.message}`,
          });
        }
      }
    }

    // 💾 Save sale
    const savedSale = await SaleSummary.create(newSaleData);

    res.status(201).json({
      message: `✅ Sale with ${savedSale.products.length} product(s) added successfully`,
      sale: savedSale,
      inventoryUpdates,
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

// ✅ Bulk Sale Import Route (Improved Error Propagation)
function parseDateString(dateStr) {
  if (!dateStr) return null;

  // If ISO or valid Date string
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate)) return isoDate;

  // If DD/MM/YYYY
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const formatted = new Date(`${year}-${month}-${day}`);
    if (!isNaN(formatted)) return formatted;
  }

  return null;
}

router.post("/sale/import", async (req, res) => {
  try {
    const salesData = req.body;

    if (!Array.isArray(salesData) || salesData.length === 0) {
      return res.status(400).json({
        error: "Invalid data format. Expected an array of sale records.",
      });
    }

    const results = {
      total: salesData.length,
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < salesData.length; i++) {
      const saleData = salesData[i];

      try {
        // Validate required fields
        if (
          !saleData.recordingDate ||
          !saleData.invoiceNumber ||
          !saleData.invoiceDate ||
          !saleData.mrName ||
          !saleData.customerName ||
          !saleData.products ||
          !Array.isArray(saleData.products)
        ) {
          throw new Error("Missing required fields or products array");
        }

        // Parse dates
        const recordingDate = parseDateString(saleData.recordingDate);
        const invoiceDate = parseDateString(saleData.invoiceDate);
        if (!recordingDate || !invoiceDate) {
          throw new Error(
            `Invalid date format. recordingDate: "${saleData.recordingDate}", invoiceDate: "${saleData.invoiceDate}"`
          );
        }

        // Calculate due date
        let dueDate;
        if (saleData.dueDate) {
          dueDate = parseDateString(saleData.dueDate);
        } else {
          const creditDays = Number(saleData.creditDays) || 0;
          const currentDate = new Date();
          dueDate = new Date(currentDate);
          dueDate.setDate(currentDate.getDate() + creditDays);
        }
        if (!dueDate) throw new Error("Invalid due date format");

        // Check duplicate invoice
        const invoiceExists = await checkInvoiceNumberExists(
          saleData.invoiceNumber
        );
        if (invoiceExists) {
          throw new Error(
            `Invoice number "${saleData.invoiceNumber}" already exists`
          );
        }

        // Resolve customerId from customerName
        let customerId = saleData.customerId;
        if (!customerId) {
          const customer = await Customer.findOne({
            name: saleData.customerName.trim(),
          });
          if (!customer) {
            throw new Error(`Customer not found: "${saleData.name}"`);
          }
          customerId = customer._id;
        } else {
          const customerExists = await Customer.findById(customerId);
          if (!customerExists) {
            throw new Error(`Invalid customerId: ${customerId}`);
          }
        }

        // Calculate totals
        const totalAmount = saleData.products.reduce((sum, p) => {
          const qty = Number(p.salesQty) || 0;
          const price = Number(p.sellingPrice) || 0;
          const discount = Number(p.discount) || 0;
          return sum + qty * price - discount;
        }, 0);

        const paidAmount = Number(saleData.paidAmount) || 0;
        const dueAmount = totalAmount - paidAmount;

        const newSaleData = {
          recordingDate,
          invoiceNumber: saleData.invoiceNumber,
          invoiceDate,
          mrName: saleData.mrName,
          customerName: saleData.customerName,
          customerId, // ← Store customerId
          creditDays: Number(saleData.creditDays) || 0,
          paidAmount,
          dueAmount,
          totalAmount,
          dueDate,
          paymentStatus: saleData.paymentStatus || "Credit",
          remark: saleData.remarks || "",
          products: [],
        };

        // Process products
        for (const product of saleData.products) {
          const salesQty = Number(product.salesQty) || 0;
          const bonusQty = Number(product.bonusQty) || 0;
          const totalQty = salesQty + bonusQty;
          const sellingPrice = Number(product.sellingPrice) || 0;
          const discount = Number(product.discount) || 0;
          const amount = salesQty * sellingPrice;
          const netSellingAmount = amount - discount;

          const lcValue = await updateReportInHandAfterSale(
            product.productName,
            salesQty,
            bonusQty
          );

          const profitLoss = netSellingAmount - totalQty * lcValue;

          newSaleData.products.push({
            productName: product.productName,
            salesQty,
            bonusQty,
            totalQty,
            sellingPrice,
            amount,
            discount,
            netSellingAmount,
            averageUnitPrice: sellingPrice,
            lc: lcValue,
            profitLoss,
            isProductAccept: true,
          });
        }

        await SaleSummary.create(newSaleData);
        results.success++;
      } catch (error) {
        console.error(`Failed to import sale at index ${i}:`, error.message);
        results.failed++;
        results.errors.push({
          index: i,
          invoiceNumber: saleData.invoiceNumber || "N/A",
          error: error.message,
        });
      }
    }

    const detailedErrors = results.errors.map(
      (e) => `Invoice ${e.invoiceNumber}: ${e.error}`
    );

    res.status(200).json({
      success: results.failed === 0,
      message:
        detailedErrors.length > 0
          ? detailedErrors.join("<br>")
          : "All imported successfully",
      results,
    });
  } catch (error) {
    console.error("Bulk import error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Updated PUT /sales/:id endpoint with invoice number validation
router.put("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Get original sale data
    const originalSale = await SaleSummary.findById(id);
    if (!originalSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    // Check if invoice number is being changed and if it already exists
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

    // Restore original inventory first for all products
    for (const product of originalSale.products) {
      if (product.salesQty > 0 || product.bonusQty > 0) {
        await restoreReportInHandAfterSaleDeletion(
          product.productName,
          product.salesQty,
          product.bonusQty
        );
      }
    }

    // Update the sale
    const updatedSale = await SaleSummary.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    // Update inventory with new quantities for all products
    for (const product of updatedSale.products) {
      if (product.salesQty > 0 || product.bonusQty > 0) {
        const lcValue = await updateReportInHandAfterSale(
          product.productName,
          product.salesQty,
          product.bonusQty
        );

        // Update LC and profit/loss with actual values
        product.lc = lcValue;
        product.profitLoss =
          product.netSellingAmount - product.totalQty * lcValue;
      }
    }

    await updatedSale.save();

    res.status(200).json(updatedSale);
  } catch (err) {
    console.error("Error updating sale:", err);

    // Handle duplicate invoice number error from MongoDB
    if (err.code === 11000) {
      return res.status(400).json({
        error: `Invoice number "${req.body.invoiceNumber}" already exists. Please use a different invoice number.`,
      });
    }

    res.status(500).json({ error: "Failed to update sales record." });
  }
});

// GET /sales endpoint
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
        { customerName: searchRegex },
        { "products.productName": searchRegex },
      ];
    }

    // Tab filter (payment status)
    if (tab && tab !== "All") {
      matchConditions.paymentStatus = new RegExp(`^${tab}$`, "i");
    }

    // Get total count for pagination
    const totalCount = await SaleSummary.countDocuments(matchConditions);
    const totalPages = Math.ceil(totalCount / limitNum);

    // Get paginated data
    const summaries = await SaleSummary.find(matchConditions)
      .sort({ recordingDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .select({
        // Include all fields you want
        recordingDate: 1,
        invoiceNumber: 1,
        invoiceDate: 1,
        mrName: 1,
        mrId: 1,
        customerCode: 1,
        customerId: 1,
        customerName: 1, // Now directly from SaleSummary
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

// DELETE /sales/:id endpoint
router.delete("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const saleToDelete = await SaleSummary.findById(id);

    if (!saleToDelete) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    // ✅ Restore inventory before deleting the sale for all products
    for (const product of saleToDelete.products) {
      if (product.salesQty > 0 || product.bonusQty > 0) {
        await restoreReportInHandAfterSaleDeletion(
          product.productName,
          product.salesQty,
          product.bonusQty
        );
      }
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

router.post("/sales/download-excel", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    // --- Validation ---
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

    // --- Fetch filtered sales data ---
    const filteredSalesData = await SaleSummary.find({
      invoiceDate: { $gte: start, $lte: end },
    }).sort({ invoiceDate: 1 });

    if (filteredSalesData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No sales data found for the selected date range",
      });
    }

    // ✅ Extract all unique customerIds
    const customerIds = [
      ...new Set(filteredSalesData.map((sale) => sale.customerId?.toString())),
    ];

    // ✅ Fetch customer details using _id
    const customers = await Customer.find({
      _id: { $in: customerIds },
    });

    // ✅ Create lookup map (by _id)
    const customerMap = {};
    customers.forEach((cust) => {
      customerMap[cust._id.toString()] = cust;
    });

    // === Create Excel Workbook & Sheet ===
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sale Summary");

    // === Sheet Titles ===
    worksheet.mergeCells("A1:AC1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    worksheet.mergeCells("A2:AC2");
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

    // === Header Row ===
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
      "totalAmount",
    ].forEach((key) => {
      const col = worksheet.getColumn(key);
      if (col) col.numFmt = "#,##0.00";
    });

    // === Add Data Rows ===
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
          creditDays: sale.creditDays,
          dueDate: formatDate(sale.dueDate),
          deliveryDate: formatDate(sale.recordingDate),
          paidAmount: sale.paidAmount,
          dueAmount: sale.dueAmount,
          totalAmount: sale.totalAmount,
          paymentStatus: sale.paymentStatus,
          remark: sale.remark,
        });

        // Add borders
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

    // === Send File to Client ===
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

// Other routes
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

export default router;
