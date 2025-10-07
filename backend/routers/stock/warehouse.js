// routes/stockTransfersRoutes.js

import express from "express";
import Warehouse from "../../models/stock/warehouse.js"; // ✅ Adjust the path as needed

const router = express.Router();

router.get("/warehouses", async (req, res) => {
  try {
    const warehouses = await Warehouse.find({})
      .sort({ name: 1 }) // Sort alphabetically by name
      .select("_id name code") // Only include required fields
      .lean();

    res.status(200).json(warehouses);
  } catch (error) {
    console.error("❌ Error fetching warehouses:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching warehouses",
      error: error.message,
    });
  }
});

export default router;
