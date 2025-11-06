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
    for (const productData of products) {
      const {
        productName,
        type,
        packing,
        sellingPriceUSD,
        lcUSD,
        fobUSD, // NEW: Added FOB field
        taxSellingPriceUSD,
        qtyPerBoxStrip,
        supplierName,
        drugLicense,
        licenseValidityDate,
        remarks,
      } = productData;

      const parsedDate = parseDate(licenseValidityDate);

      const product = new Product({
        productName,
        type,
        packing,
        sellingPrice: sellingPriceUSD, // map incoming key to your DB field
        lc: lcUSD,
        fob: fobUSD, // NEW: Map FOB field to database
        taxSellingPrice: taxSellingPriceUSD,
        qtyPerBoxStrip,
        supplierName,
        drugLicense,
        licenseValidityDate: parsedDate,
        remarks,
      });

      await product.save();
    }

    res.status(200).json({ message: "Products imported successfully!" });
  } catch (err) {
    console.error("Error importing products:", err);
    res.status(500).json({ message: "Failed to import products." });
  }
});

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
