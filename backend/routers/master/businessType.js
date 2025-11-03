
import express from "express";
import BusinessType  from "../../models/master/businessTypes.js";
const router = express.Router();

// GET /api/business-types - Get all business types
router.get("/business-types", async (req, res) => {
  try {
    const businessTypes = await BusinessType.find().sort({ name: 1 });

    res.json({
      success: true,
      data: businessTypes,
      message: "Business types fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching business types:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching business types",
    });
  }
});

export default router;
