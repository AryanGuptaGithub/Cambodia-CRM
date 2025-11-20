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
    // Try different date formats
    const formats = [
      // DD/MM/YYYY
      () => {
        const [day, month, year] = dateStr
          .split("/")
          .map((part) => parseInt(part, 10));
        if (day && month && year) {
          return new Date(year, month - 1, day);
        }
        return null;
      },
      // YYYY-MM-DD (ISO format from date inputs)
      () => {
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
      },
      // MM/DD/YYYY
      () => {
        const [month, day, year] = dateStr
          .split("/")
          .map((part) => parseInt(part, 10));
        if (month && day && year) {
          return new Date(year, month - 1, day);
        }
        return null;
      },
    ];

    for (const format of formats) {
      const parsedDate = format();
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
  }

  console.warn(`Unable to parse date:`, dateStr);
  return null;
};

router.post("/product/import", async (req, res) => {
  try {
    const products = req.body;
    const errors = [];
    const successfulImports = [];

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
        if (!productName) {
          errors.push(`Row ${index + 1}: Product name is required`);
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
          // Extract numbers from string (e.g., "100 tablets", "50 capsules", "25 ml")
          const numericMatch = qtyString.match(/\d+/);
          if (numericMatch) {
            parsedQtyPerBoxStrip = parseInt(numericMatch[0], 10);
          } else {
            errors.push(
              `Row ${
                index + 1
              }: Quantity must be a number. Examples: "100", "50 tablets", "25ml". Received: "${qtyString}"`
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

        // Parse other numeric fields
        const parseNumericField = (value, fieldName, defaultValue = 0) => {
          if (value === undefined || value === null || value === "")
            return defaultValue;

          const num = parseFloat(value);
          if (isNaN(num)) {
            errors.push(
              `Row ${
                index + 1
              }: ${fieldName} must be a number. Using default value: ${defaultValue}`
            );
            return defaultValue;
          }
          return num;
        };

        const parsedSellingPrice = parseNumericField(
          sellingPriceUSD,
          "Selling Price"
        );
        const parsedLc = parseNumericField(lcUSD, "LC Price");
        const parsedFob = parseNumericField(fobUSD, "FOB Price");
        const parsedTaxSellingPrice = parseNumericField(
          taxSellingPriceUSD,
          "Tax Selling Price"
        );

        const parsedDate = parseDate(licenseValidityDate);

        // Create and save product
        const product = new Product({
          productName: productName.toString().trim(),
          type: type?.toString().trim(),
          packing: packing?.toString().trim(),
          sellingPrice: parsedSellingPrice,
          lc: parsedLc,
          fob: parsedFob,
          taxSellingPrice: parsedTaxSellingPrice,
          qtyPerBoxStrip: parsedQtyPerBoxStrip,
          supplierName: supplierName?.toString().trim(),
          drugLicense: drugLicense?.toString().trim(),
          licenseValidityDate: parsedDate,
          remarks: remarks?.toString().trim(),
        });

        await product.save();
        successfulImports.push({
          name: productName,
          row: index + 1,
        });
      } catch (productError) {
        console.error(
          `Error importing product at row ${index + 1}:`,
          productError
        );

        let errorMessage = `Row ${index + 1}: Failed to import product`;

        if (productError.name === "ValidationError") {
          const validationErrors = Object.values(productError.errors).map(
            (err) => `${err.path}: ${err.message}`
          );
          errorMessage = `Row ${index + 1}: ${validationErrors.join(", ")}`;
        } else if (productError.code === 11000) {
          errorMessage = `Row ${index + 1}: Product "${
            productData.productName
          }" already exists`;
        } else {
          errorMessage = `Row ${index + 1}: ${productError.message}`;
        }

        errors.push(errorMessage);
      }
    }

    // Response logic remains the same as above
    if (errors.length > 0 && successfulImports.length === 0) {
      return res.status(400).json({
        success: false,
        message: "All products failed to import",
        errors: errors,
        importedCount: 0,
        failedCount: errors.length,
      });
    } else if (errors.length > 0) {
      return res.status(207).json({
        success: true,
        message: `Successfully imported ${successfulImports.length} products, ${errors.length} failed`,
        importedCount: successfulImports.length,
        failedCount: errors.length,
        importedProducts: successfulImports,
        errors: errors,
      });
    } else {
      return res.status(200).json({
        success: true,
        message: `All ${successfulImports.length} products imported successfully!`,
        importedCount: successfulImports.length,
        importedProducts: successfulImports,
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

    // Merge product + stock
    const finalList = products.map((product) => {
      const stock = stockMap.get(product.productName.toLowerCase());

      return {
        ...product.toObject(),

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

// router.get("/products", async (req, res) => {
//   try {
//     const products = await Product.find();
//     res.status(200).json(products);
//   } catch (err) {
//     console.error("Error fetching products:", err);
//     res.status(500).json({ message: "Failed to fetch products." });
//   }
// });

router.get("/products", async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json(products);
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

    // Combine the data
    const productsWithStock = products.map((product) => {
      const stock = stockByProduct.find(
        (s) => s._id.toLowerCase() === product.productName.toLowerCase()
      );

      return {
        ...product.toObject(),
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
    const updatedData = req.body;

    const updatedProduct = await Product.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    });

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    return res.status(200).json(updatedProduct);
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
      qtyPerBoxStrip, // Changed from qtyPerBox
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

    const newProduct = new Product({
      productName: productName.trim(),
      type: type.trim(),
      packing: packing.trim(),
      qtyPerBoxStrip: qtyPerBoxStrip ? Number(qtyPerBoxStrip) : 0, // Updated field
      supplierName: supplierName ? supplierName.trim() : "",
      drugLicense: drugLicense ? drugLicense.trim() : "",
      licenseValidityDate: parsedLicenseDate,
      remarks: remarks ? remarks.trim() : "",
      sellingPrice: sellingPrice ? Number(sellingPrice) : 0,
      lc: lc ? Number(lc) : 0, // Changed to number for USD
      fob: fob ? Number(fob) : 0, // Changed to number for USD
      taxSellingPrice: taxSellingPrice ? Number(taxSellingPrice) : 0,
    });

    const savedProduct = await newProduct.save();
    return res.status(201).json({
      message: `Product <b>${productName}</b> added successfully`,
      product: savedProduct,
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

export default router;
