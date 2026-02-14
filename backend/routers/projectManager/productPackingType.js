import express from "express";
import ProductPackingType from "../../models/projectManger/ProductPackingType.js"; 

const router = express.Router();

// GET ALL PRODUCT PACKING TYPES
router.get("/", async (req, res) => {
  try {
    const packingTypes = await ProductPackingType.find().sort({ name: 1 });
    res.json({
      success: true,
      data: packingTypes,
      message: "Product packing types retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching product packing types:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching product packing types",
      error: error.message,
    });
  }
});

// GET SINGLE PRODUCT PACKING TYPE
router.get("/:id", async (req, res) => {
  try {
    const packingType = await ProductPackingType.findById(req.params.id);

    if (!packingType) {
      return res.status(404).json({
        success: false,
        message: "Product packing type not found",
      });
    }

    res.json({
      success: true,
      data: packingType,
    });
  } catch (error) {
    console.error("Error fetching product packing type:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching product packing type",
      error: error.message,
    });
  }
});

export default router;