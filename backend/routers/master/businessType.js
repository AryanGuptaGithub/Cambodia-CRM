import express from "express";
import BusinessType from "../../models/master/businessTypes.js";

const router = express.Router();

// GET all business types
router.get("/", async (req, res) => {
  try {
    const businessTypes = await BusinessType.find().sort({ name: 1 });

    if (!businessTypes || businessTypes.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No business types found",
      });
    }

    res.status(200).json({
      success: true,
      data: businessTypes,
      message: "Business types fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching business types:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching business types",
      error: error.message,
    });
  }
});

export default router;