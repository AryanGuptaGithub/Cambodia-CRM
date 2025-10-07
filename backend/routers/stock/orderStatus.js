import express from "express";
import Warehouse from "../../models/stock/warehouse.js";
import OrderStatus from "../../models/stock/orderStatus.js"; // ✅ Import OrderStatus model

const router = express.Router();

// ✅ Get all order statuses
router.get("/order-statuses", async (req, res) => {
  try {
    const orderStatuses = await OrderStatus.find({})
      .sort({ name: 1 }) // Sort alphabetically by name
      .select("_id name code description") // Include required fields
      .lean();

    res.status(200).json(orderStatuses);
  } catch (error) {
    console.error("❌ Error fetching order statuses:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching order statuses",
      error: error.message,
    });
  }
});

export default router;