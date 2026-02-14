import express from "express";
import Payroll from "../../models/Hrm/Payroll.js";
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    // ===== Get current + previous month =========
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    const currentPeriod = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

    let previousYear = currentYear;
    let previousMonth = currentMonth - 1;

    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear -= 1;
    }

    const previousPeriod = `${previousYear}-${String(previousMonth).padStart(2, "0")}`;

    // ===== Previous Month Payroll Total =========
    const previousMonthPayrolls = await Payroll.aggregate([
      {
        $match: {
          period: previousPeriod,
          enabled: true,
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$netSalary" },
        },
      },
    ]);

    const previousMonthAmount =
      previousMonthPayrolls.length > 0
        ? previousMonthPayrolls[0].totalAmount
        : 0;

    // ===== Get Latest (Created or Updated) Payroll =========
    const latestPayroll = await Payroll.findOne()
      .sort({ updatedAt: -1, createdAt: -1 }) // newest first
      .lean();

    // ===== Response =========
    res.status(200).json({
      success: true,
      payrollSummary: {
        previousMonth: previousMonthAmount,
      },
      latestPayroll, // full latest record
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch payroll summary",
      error: error.message,
    });
  }
});

export default router;