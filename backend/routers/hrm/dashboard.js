import express from "express";
import Payroll from "../../models/Hrm/Payroll.js";

const router = express.Router();

/**
 * GET /api/hrm/payroll
 * Returns payroll records for a given period (query parameter `period`)
 * Example: /api/hrm/payroll?period=2025-02
 */
router.get("/", async (req, res) => {
  try {
    const { period } = req.query;

    // Period is required (format: YYYY-MM)
    if (!period) {
      return res.status(400).json({
        success: false,
        message: "Period is required (format: YYYY-MM)"
      });
    }

    // Fetch payroll records for the given period where enabled = true
    // Populate employeeId with relevant fields from the Staff model
    const payrollRecords = await Payroll.find({ period, enabled: true })
      .populate({
        path: "employeeId",
        select: "medicalRepName contactNo email isActive" // adjust field names as per your Staff schema
      })
      .sort({ createdAt: -1 })
      .lean();

    // Calculate total net salary for the period (optional, frontend may recalc)
    const total = payrollRecords.reduce((sum, item) => sum + (item.netSalary || 0), 0);

    res.status(200).json({
      success: true,
      data: payrollRecords,
      total: total,
      period: period
    });
  } catch (error) {
    console.error("Error fetching payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payroll data",
      error: error.message,
    });
  }
});

export default router;