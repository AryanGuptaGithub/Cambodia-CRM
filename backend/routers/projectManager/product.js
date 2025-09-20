import express from "express";
const router = express.Router();
import Product from "../../models/projectManger/product.js";

const parseDate = (dateStr) => {
  if (typeof dateStr === "number") {
    const baseDate = new Date(1900, 0, 1);
    return new Date(baseDate.setDate(baseDate.getDate() + dateStr - 2));
  }

  if (typeof dateStr !== "string") {
    console.warn(`Expected a string but got ${typeof dateStr}:`, dateStr);
    return null;
  }

  const [day, month, year] = dateStr.split("/").map((part) => parseInt(part, 10));
  const parsedDate = new Date(year, month - 1, day);

  return isNaN(parsedDate) ? null : parsedDate;
};

router.post("/product/import", async (req, res) => {
  try {
    const products = req.body;

    for (const productData of products) {
      const {
        productName,
        type,
        packing,
        qtyPerBox,
        qtyPerCarton,
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
        qtyPerBox,
        qtyPerCarton,
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

router.get('/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ message: 'Failed to fetch products.' });
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

router.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedProduct = await Product.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.status(200).json({ message: `Product <b>${deletedProduct.productName}</b> deleted successfully.` });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ message: "Server error." });
  }
});

export default router;
