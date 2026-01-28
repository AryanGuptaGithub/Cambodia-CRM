import express from "express";
import mongoose from "mongoose";
const router = express.Router();
import Product from "../../models/projectManger/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";

const parseDate = (dateStr) => {
  if (!dateStr) return null;

  // If it's already a Date object
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }

  // If it's a number (Excel serial date)
  if (typeof dateStr === "number") {
    const baseDate = new Date(1900, 0, 1);
    const resultDate = new Date(
      baseDate.setDate(baseDate.getDate() + dateStr - 2)
    );
    return isNaN(resultDate.getTime()) ? null : resultDate;
  }

  // If it's a string
  if (typeof dateStr === "string") {
    const cleanDateStr = dateStr.trim();

    // Return null for empty or "N/A" strings
    if (!cleanDateStr || cleanDateStr.toLowerCase() === "n/a") {
      return null;
    }

    // Try different date formats in order
    const formats = [
      // ISO format (YYYY-MM-DD) - from date inputs
      () => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDateStr)) {
          const date = new Date(cleanDateStr);
          if (!isNaN(date.getTime())) {
            date.setHours(12, 0, 0, 0);
            return date;
          }
        }
        return null;
      },

      // DD/MM/YYYY format (e.g., 31/07/2025)
      () => {
        const match = cleanDateStr.match(
          /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/
        );
        if (match) {
          const day = parseInt(match[1], 10);
          const month = parseInt(match[2], 10) - 1;
          const year = parseInt(match[3], 10);

          // Validate date components
          if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
            const date = new Date(year, month, day, 12, 0, 0);
            if (
              !isNaN(date.getTime()) &&
              date.getDate() === day &&
              date.getMonth() === month
            ) {
              return date;
            }
          }
        }
        return null;
      },

      // MM/DD/YYYY format
      () => {
        const match = cleanDateStr.match(
          /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/
        );
        if (match) {
          const month = parseInt(match[1], 10) - 1;
          const day = parseInt(match[2], 10);
          const year = parseInt(match[3], 10);

          if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
            const date = new Date(year, month, day, 12, 0, 0);
            if (
              !isNaN(date.getTime()) &&
              date.getDate() === day &&
              date.getMonth() === month
            ) {
              return date;
            }
          }
        }
        return null;
      },

      // DD MMM YYYY format (e.g., 07 Sept 2198)
      () => {
        const match = cleanDateStr.match(
          /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/
        );
        if (match) {
          const day = parseInt(match[1], 10);
          const monthStr = match[2].toLowerCase();
          const year = parseInt(match[3], 10);

          // Month names mapping
          const monthNames = {
            jan: 0,
            january: 0,
            feb: 1,
            february: 1,
            mar: 2,
            march: 2,
            apr: 3,
            april: 3,
            may: 4,
            jun: 5,
            june: 5,
            jul: 6,
            july: 6,
            aug: 7,
            august: 7,
            sep: 8,
            september: 8,
            oct: 9,
            october: 9,
            nov: 10,
            november: 10,
            dec: 11,
            december: 11,
          };

          let month = monthNames[monthStr];
          if (month === undefined) {
            // Try partial match
            for (const [key, value] of Object.entries(monthNames)) {
              if (key.startsWith(monthStr) || monthStr.startsWith(key)) {
                month = value;
                break;
              }
            }
          }

          if (month !== undefined && day >= 1 && day <= 31) {
            const date = new Date(year, month, day, 12, 0, 0);
            if (
              !isNaN(date.getTime()) &&
              date.getDate() === day &&
              date.getMonth() === month
            ) {
              return date;
            }
          }
        }
        return null;
      },

      // Try JavaScript's built-in parser as a last resort
      () => {
        const date = new Date(cleanDateStr);
        if (!isNaN(date.getTime())) {
          date.setHours(12, 0, 0, 0);
          return date;
        }
        return null;
      },
    ];

    // Try each format until one succeeds
    for (const format of formats) {
      const parsedDate = format();
      if (parsedDate) {
        return parsedDate;
      }
    }
    return null;
  }

  return null;
};

const normalizeString = (str) => {
  if (!str) return "";
  return str.toString().trim().toLowerCase();
};

router.post("/product/import", async (req, res) => {
  try {
    const products = req.body;

    const errors = [];
    const successfulImports = [];
    const duplicateProducts = [];
    const uniqueProducts = new Set();

    // First pass: identify duplicates in the import data itself
    for (const [index, productData] of products.entries()) {
      try {
        const {
          productName,
          type,
          packing,
          sellingPriceUSD,
          lcUSD,
          fobUSD,
          taxSellingPriceUSD,
          qtyPerBoxStrip,
          supplierName,
          drugLicense,
          licenseValidityDate,
          remarks,
        } = productData;

        // Validate required fields
        if (!productName || productName.toString().trim() === "") {
          errors.push(`Row ${index + 1}: Product name is required`);
          continue;
        }

        if (!type || type.toString().trim() === "") {
          errors.push(`Row ${index + 1}: Product type is required`);
          continue;
        }

        if (!packing || packing.toString().trim() === "") {
          errors.push(`Row ${index + 1}: Packing is required`);
          continue;
        }

        // Enhanced qtyPerBoxStrip validation
        let parsedQtyPerBoxStrip;

        if (
          qtyPerBoxStrip === undefined ||
          qtyPerBoxStrip === null ||
          qtyPerBoxStrip === ""
        ) {
          errors.push(`Row ${index + 1}: Quantity per box/strip is required`);
          continue;
        }

        const qtyString = qtyPerBoxStrip.toString().trim();

        // Check if it's already a valid number
        if (!isNaN(qtyString) && qtyString !== "") {
          parsedQtyPerBoxStrip = parseInt(qtyString, 10);
        } else {
          // Extract numbers from string
          const numericMatch = qtyString.match(/\d+/g);
          if (numericMatch && numericMatch.length > 0) {
            parsedQtyPerBoxStrip = parseInt(numericMatch[0], 10);
          } else {
            errors.push(
              `Row ${
                index + 1
              }: Quantity must contain a number. Received: "${qtyString}"`
            );
            continue;
          }
        }

        // Final validation
        if (isNaN(parsedQtyPerBoxStrip) || parsedQtyPerBoxStrip <= 0) {
          errors.push(
            `Row ${
              index + 1
            }: Quantity must be a positive number. Received: "${qtyString}"`
          );
          continue;
        }

        // Parse numeric fields
        const parseNumericField = (value, fieldName, defaultValue = 0) => {
          if (value === undefined || value === null || value === "") {
            return defaultValue;
          }

          const strValue = value.toString().trim();
          if (strValue === "") {
            return defaultValue;
          }

          // Remove any commas or currency symbols
          const cleanValue = strValue.replace(/[$,]/g, "").trim();

          const num = parseFloat(cleanValue);
          if (isNaN(num)) {
            console.warn(
              `Row ${
                index + 1
              }: ${fieldName} is not a valid number. Using default: ${defaultValue}`
            );
            return defaultValue;
          }
          return num;
        };

        // Parse all numeric fields
        const parsedSellingPrice = parseNumericField(
          sellingPriceUSD,
          "Selling Price",
          0
        );

        const parsedLc = parseNumericField(lcUSD, "LC Price", 0);

        const parsedFob = parseNumericField(fobUSD, "FOB Price", 0);

        const parsedTaxSellingPrice = parseNumericField(
          taxSellingPriceUSD,
          "Tax Selling Price",
          0
        );

        // Parse date - handle "N/A", empty, and various formats
        let parsedDate = null;
        if (
          licenseValidityDate &&
          licenseValidityDate.toString().trim() !== "" &&
          licenseValidityDate.toString().trim().toLowerCase() !== "n/a"
        ) {
          parsedDate = parseDate(licenseValidityDate);
          if (!parsedDate) {
            console.warn(
              `Row ${
                index + 1
              }: Could not parse date "${licenseValidityDate}", using null`
            );
          }
        }

        // Clean up drug license and other string fields - store as lowercase
        const cleanProductName = normalizeString(productName);
        const cleanType = normalizeString(type);
        const cleanPacking = normalizeString(packing);
        const cleanSupplierName = normalizeString(supplierName);
        let cleanDrugLicense = normalizeString(drugLicense);
        
        if (cleanDrugLicense === "n/a") {
          cleanDrugLicense = "";
        }

        // Check for duplicate in current import batch
        const productKey = `${cleanProductName}_${cleanType}_${cleanPacking}_${cleanSupplierName}`;

        if (uniqueProducts.has(productKey)) {
          // This is a duplicate within the import file
          duplicateProducts.push({
            name: productName,
            row: index + 1,
            reason: "Duplicate in import file",
          });
          continue;
        }

        uniqueProducts.add(productKey);

        // Check for existing product in database (case-insensitive search)
        const existingProduct = await Product.findOne({
          productName: { $regex: new RegExp(`^${cleanProductName}$`, "i") },
          type: { $regex: new RegExp(`^${cleanType}$`, "i") },
          packing: { $regex: new RegExp(`^${cleanPacking}$`, "i") },
          supplierName: { $regex: new RegExp(`^${cleanSupplierName}$`, "i") },
        });

        if (existingProduct) {
          // Duplicate found in database
          duplicateProducts.push({
            name: productName,
            row: index + 1,
            reason: "Already exists in database",
          });
          continue;
        }

        // Create new product with lowercase storage
        const product = new Product({
          productName: cleanProductName, // Store as lowercase
          type: cleanType, // Store as lowercase
          packing: cleanPacking, // Store as lowercase
          sellingPrice: parsedSellingPrice,
          lc: parsedLc,
          fob: parsedFob,
          taxSellingPrice: parsedTaxSellingPrice,
          qtyPerBoxStrip: parsedQtyPerBoxStrip,
          supplierName: cleanSupplierName, // Store as lowercase
          drugLicense: cleanDrugLicense, // Store as lowercase
          licenseValidityDate: parsedDate,
          remarks: normalizeString(remarks),
        });

        await product.save();
        successfulImports.push({
          name: productName,
          row: index + 1,
          action: "created",
        });
      } catch (productError) {
        console.error(
          `Error processing product at row ${index + 1}:`,
          productError.message || productError
        );

        let errorMessage = `Row ${index + 1}: Failed to process product "${
          productData.productName
        }"`;

        if (productError.name === "ValidationError") {
          const validationErrors = Object.values(productError.errors).map(
            (err) => `${err.path}: ${err.message}`
          );
          errorMessage = `Row ${index + 1}: ${validationErrors.join(", ")}`;
        } else if (productError.code === 11000) {
          errorMessage = `Row ${index + 1}: Product "${
            productData.productName
          }" already exists`;
          duplicateProducts.push({
            name: productData.productName,
            row: index + 1,
            reason: "Database constraint violation",
          });
        } else {
          errorMessage = `Row ${index + 1}: ${productError.message}`;
        }

        errors.push(errorMessage);
      }
    }

    const totalProcessed =
      successfulImports.length + duplicateProducts.length + errors.length;
    let message = `Successfully imported ${successfulImports.length} product(s)`;
    if (duplicateProducts.length > 0) {
      message += `, ${duplicateProducts.length} duplicate record(s) found`;
    }
    if (errors.length > 0) {
      message += `, ${errors.length} error(s) encountered`;
    }

    if (errors.length > 0 && successfulImports.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All products failed to import",
        errors: errors,
        importedCount: 0,
        duplicateCount: duplicateProducts.length,
        failedCount: errors.length,
        totalProcessed: totalProcessed,
      });
    } else if (errors.length > 0 || duplicateProducts.length > 0) {
      return res.status(207).json({
        success: true,
        message: message,
        importedCount: successfulImports.length,
        duplicateCount: duplicateProducts.length,
        failedCount: errors.length,
        importedProducts: successfulImports,
        duplicateProducts: duplicateProducts,
        errors: errors,
        totalProcessed: totalProcessed,
      });
    } else {
      return res.status(200).json({
        success: true,
        message: message,
        importedCount: successfulImports.length,
        duplicateCount: duplicateProducts.length,
        importedProducts: successfulImports,
        totalProcessed: totalProcessed,
      });
    }
  } catch (err) {
    console.error("Error importing products:", err);

    res.status(500).json({
      success: false,
      message: "Failed to import products due to server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

router.get("/dropdown-products", async (req, res) => {
  try {
    // Get all product master data
    const products = await Product.find();

    // Get all stock data from ReportInHand
    const stockList = await ReportInHand.find();

    // Convert stockList to map for fast lookup by productName (case-insensitive)
    const stockMap = new Map();
    stockList.forEach((item) => {
      stockMap.set(item.productName.toLowerCase(), item);
    });

    // Merge product + stock with formatted display names
    const finalList = products.map((product) => {
      const stock = stockMap.get(product.productName.toLowerCase());

      return {
        ...product.toObject(),
        
        // Format display names
        productName: product.productName
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        type: product.type
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        supplierName: product.supplierName
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        drugLicense: product.drugLicense
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),

        // Include batches from stock if available
        batches: stock?.batches || [],

        totalBoxes: stock?.totalBoxes || 0,
        totalAmount: stock?.totalAmount || 0,

        status: stock?.status || "Out of Stock",
        minStockLevel: stock?.minStockLevel || 0,
        category: stock?.category || "Uncategorized",

        lc: stock?.lc || 0,
        fob: stock?.fob || 0,
        cif: stock?.cif || 0,

        stockLastUpdated: stock?.updatedAt || null,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    });

    res.status(200).json({ success: true, data: finalList });
  } catch (err) {
    console.error("❌ Error fetching products with stock:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch products." });
  }
});
router.get("/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ productName: 1 });
    
    // Format for display
    const formattedProducts = products.map(product => ({
      ...product.toObject(),
      productName: product.productName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      type: product.type
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      supplierName: product.supplierName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      drugLicense: product.drugLicense
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    }));
    
    res.status(200).json(formattedProducts);
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ message: "Failed to fetch products." });
  }
});

router.get("/products-with-in-stock", async (req, res) => {
  try {
    const stockByProduct = await ReportInHand.aggregate([
      {
        $group: {
          _id: "$productName",
          totalBoxes: { $sum: "$quantity.boxes" },
        },
      },
    ]);

    const products = await Product.find();

    // Combine the data with formatted display names
    const productsWithStock = products.map((product) => {
      const stock = stockByProduct.find(
        (s) => s._id.toLowerCase() === product.productName.toLowerCase()
      );

      return {
        ...product.toObject(),
        productName: product.productName
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        type: product.type
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        supplierName: product.supplierName
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        inStock: {
          boxes: stock?.totalBoxes || 0,
          status: stock?.totalBoxes > 0 ? "In Stock" : "Out of Stock",
        },
      };
    });

    res.status(200).json(productsWithStock);
  } catch (err) {
    console.error("Error fetching products with stock:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch products with stock information." });
  }
});

router.put("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let updatedData = req.body;
    
    // Convert string fields to lowercase before saving
    if (updatedData.productName) {
      updatedData.productName = normalizeString(updatedData.productName);
    }
    if (updatedData.type) {
      updatedData.type = normalizeString(updatedData.type);
    }
    if (updatedData.packing) {
      updatedData.packing = normalizeString(updatedData.packing);
    }
    if (updatedData.supplierName) {
      updatedData.supplierName = normalizeString(updatedData.supplierName);
    }
    if (updatedData.drugLicense) {
      updatedData.drugLicense = normalizeString(updatedData.drugLicense);
    }
    if (updatedData.remarks) {
      updatedData.remarks = normalizeString(updatedData.remarks);
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    });

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    // Format for display
    const formattedProduct = {
      ...updatedProduct.toObject(),
      productName: updatedProduct.productName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      type: updatedProduct.type
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      supplierName: updatedProduct.supplierName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      drugLicense: updatedProduct.drugLicense
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    };

    return res.status(200).json(formattedProduct);
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({ message: "Server error." });
  }
});

router.delete("/product/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedProduct = await Product.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.status(200).json({
      message: `Product <b>${deletedProduct.productName}</b> deleted successfully.`,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ message: "Server error." });
  }
});

router.delete("/products", async (req, res) => {
  try {
    let { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided for deletion." });
    }

    if (typeof ids[0] === "object" && ids[0]?.id) {
      ids = ids.map((item) => item.id);
    }

    const objectIds = ids.map((id) => {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ObjectId: ${id}`);
      }
      return new mongoose.Types.ObjectId(id);
    });

    const result = await Product.deleteMany({ _id: { $in: objectIds } });

    return res.status(200).json({
      message: `${result.deletedCount} product(s) deleted successfully.`,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return res
      .status(500)
      .json({ message: "Server error while deleting products." });
  }
});

router.post("/product/add", async (req, res) => {
  try {
    const {
      productName,
      type,
      packing,
      qtyPerBoxStrip,
      supplierName,
      drugLicense,
      licenseValidityDate,
      remarks,
      sellingPrice,
      lc,
      fob,
      taxSellingPrice,
    } = req.body;

    // Validate required fields
    if (!productName || !type || !packing) {
      return res
        .status(400)
        .json({ message: "Please fill all required fields." });
    }

    // Parse date if provided
    let parsedLicenseDate = null;
    if (licenseValidityDate) {
      parsedLicenseDate = parseDate(licenseValidityDate);
    }

    // Store all string fields in lowercase
    const newProduct = new Product({
      productName: normalizeString(productName),
      type: normalizeString(type),
      packing: normalizeString(packing),
      qtyPerBoxStrip: qtyPerBoxStrip ? Number(qtyPerBoxStrip) : 0,
      supplierName: supplierName ? normalizeString(supplierName) : "",
      drugLicense: drugLicense ? normalizeString(drugLicense) : "",
      licenseValidityDate: parsedLicenseDate,
      remarks: remarks ? normalizeString(remarks) : "",
      sellingPrice: sellingPrice ? Number(sellingPrice) : 0,
      lc: lc ? Number(lc) : 0,
      fob: fob ? Number(fob) : 0,
      taxSellingPrice: taxSellingPrice ? Number(taxSellingPrice) : 0,
    });

    const savedProduct = await newProduct.save();
    
    // Format for display in response
    const formattedProduct = {
      ...savedProduct.toObject(),
      productName: savedProduct.productName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      type: savedProduct.type
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      supplierName: savedProduct.supplierName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    };

    return res.status(201).json({
      message: `Product <b>${formattedProduct.productName}</b> added successfully`,
      product: formattedProduct,
    });
  } catch (error) {
    console.error("Error adding product:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Product with this name already exists.",
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        message: "Validation error",
        errors,
      });
    }

    return res.status(500).json({
      message: "Server error while adding product",
    });
  }
});

router.get("/products/paginated", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const search = req.query.search || "";
    const type = req.query.type || "";
    
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { productName: { $regex: search, $options: "i" } },
        { supplierName: { $regex: search, $options: "i" } },
        { drugLicense: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } }
      ];
    }
    
    if (type && type.toLowerCase() !== "all") {
      query.type = { $regex: new RegExp(`^${type}$`, "i") };
    }
    
    // Get total count
    const total = await Product.countDocuments(query);
    
    // Get paginated products
    const products = await Product.find(query)
      .sort({ productName: 1 })
      .skip(skip)
      .limit(limit);
    
    // Format products for display (capitalize first letter of each word)
    const formattedProducts = products.map(product => ({
      ...product.toObject(),
      productName: product.productName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      type: product.type
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      supplierName: product.supplierName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      drugLicense: product.drugLicense
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    }));
    
    res.status(200).json({
      success: true,
      data: formattedProducts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error("Error fetching paginated products:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch products." 
    });
  }
});

router.get("/products/types", async (req, res) => {
  try {
    const types = await Product.distinct("type");
    
    // Format types for display
    const formattedTypes = types
      .filter(type => type && type.trim() !== "")
      .map(type => 
        type
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      )
      .sort();
    
    res.status(200).json({ 
      success: true, 
      data: formattedTypes 
    });
  } catch (err) {
    console.error("Error fetching product types:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch product types." 
    });
  }
});

export default router;
