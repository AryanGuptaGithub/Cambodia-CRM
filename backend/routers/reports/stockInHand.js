import express from "express";
import ReportInHand from "../../models/reports/reportsInHand.js";

const router = express.Router();

// GET /api/reports/reports-in-hand - Get all reports in hand
router.get("/reports-in-hand", async (req, res) => {
  try {
    const reports = await ReportInHand.find().sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: reports.length,
      reports: reports
    });
  } catch (error) {
    console.error("Error fetching reports in hand:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message
    });
  }
});

// GET /api/reports/reports-in-hand/:id - Get single report by ID
router.get("/reports-in-hand/:id", async (req, res) => {
  try {
    const report = await ReportInHand.findById(req.params.id);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    res.status(200).json({
      success: true,
      report: report
    });
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report",
      error: error.message
    });
  }
});

// GET /api/reports/reports-in-hand/search/:productName - Search reports by product name
router.get("/reports-in-hand/search/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    
    const reports = await ReportInHand.find({
      productName: { $regex: productName, $options: 'i' }
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      reports: reports
    });
  } catch (error) {
    console.error("Error searching reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search reports",
      error: error.message
    });
  }
});

// GET /api/reports/reports-in-hand/supplier/:supplierName - Get reports by supplier
router.get("/reports-in-hand/supplier/:supplierName", async (req, res) => {
  try {
    const { supplierName } = req.params;
    
    const reports = await ReportInHand.find({
      supplierName: { $regex: supplierName, $options: 'i' }
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      reports: reports
    });
  } catch (error) {
    console.error("Error fetching supplier reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch supplier reports",
      error: error.message
    });
  }
});

export default router;