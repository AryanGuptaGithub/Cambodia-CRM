import express from "express";
import Holiday from "../../models/Hrm/Holidays.js";
import { body, validationResult } from "express-validator";

const router = express.Router();

/** =========================
 *   GET /api/holidays
 * ========================= */
router.get("/holidays", async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ startDate: 1 }).lean();
    res.json({ success: true, holidays });
  } catch (error) {
    console.error("Error fetching holidays:", error);
    res.status(500).json({ success: false, message: "Server error while fetching holidays" });
  }
});

/** =========================
 *   POST /api/holidays
 * ========================= */
router.post(
  "/holidays",
  [
    body("name").notEmpty().withMessage("Holiday name is required"),
    body("startDate").isISO8601().withMessage("Valid start date is required"),
    body("endDate").optional().isISO8601().withMessage("Valid end date is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { name, startDate, endDate, description, type, enabled = true } = req.body;

      // Use startDate as endDate if endDate is not provided
      const finalEndDate = endDate || startDate;

      // Check if end date is before start date
      if (new Date(finalEndDate) < new Date(startDate)) {
        return res.status(400).json({
          success: false,
          message: "End date cannot be before start date"
        });
      }

      // Prevent duplicate holidays on same start date with same name
      const existing = await Holiday.findOne({ 
        name, 
        startDate: new Date(startDate) 
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Holiday with the same name and start date already exists"
        });
      }

      const holiday = new Holiday({
        name,
        startDate: new Date(startDate),
        endDate: new Date(finalEndDate),
        type: type || "General",
        description: description || "",
        enabled,
      });

      await holiday.save();

      res.status(201).json({
        success: true,
        message: "Holiday created successfully",
        holiday,
      });
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({ success: false, message: "Server error while creating holiday" });
    }
  }
);

/** =========================
 *   PUT /api/holidays/:id
 * ========================= */
router.put(
  "/holidays/:id",
  [
    body("name").notEmpty().withMessage("Holiday name is required"),
    body("startDate").isISO8601().withMessage("Valid start date is required"),
    body("endDate").optional().isISO8601().withMessage("Valid end date is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id } = req.params;
      const { name, startDate, endDate, description, type, enabled } = req.body;

      // Use startDate as endDate if endDate is not provided
      const finalEndDate = endDate || startDate;

      // Check if end date is before start date
      if (new Date(finalEndDate) < new Date(startDate)) {
        return res.status(400).json({
          success: false,
          message: "End date cannot be before start date"
        });
      }

      const updated = await Holiday.findByIdAndUpdate(
        id,
        { 
          name, 
          startDate: new Date(startDate), 
          endDate: new Date(finalEndDate), 
          description, 
          type, 
          enabled 
        },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ success: false, message: "Holiday not found" });
      }

      res.json({ 
        success: true, 
        message: "Holiday updated successfully", 
        holiday: updated 
      });
    } catch (error) {
      console.error("Error updating holiday:", error);
      res.status(500).json({ success: false, message: "Server error while updating holiday" });
    }
  }
);

/** =========================
 *   DELETE /api/holidays/:id
 * ========================= */
router.delete("/holidays/:id", async (req, res) => {
  try {
    const deleted = await Holiday.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Holiday not found" });
    }

    res.json({ success: true, message: "Holiday deleted successfully" });
  } catch (error) {
    console.error("Error deleting holiday:", error);
    res.status(500).json({ success: false, message: "Server error while deleting holiday" });
  }
});

/** =========================
 *   DELETE /api/holidays (bulk)
 * ========================= */
router.delete("/holidays", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "No holidays selected" });
    }

    const result = await Holiday.deleteMany({ _id: { $in: ids } });
    res.json({
      success: true,
      message: `${result.deletedCount} holidays deleted successfully`,
    });
  } catch (error) {
    console.error("Error bulk deleting holidays:", error);
    res.status(500).json({ success: false, message: "Server error while deleting holidays" });
  }
});

/** =========================
 *   POST /api/holidays/import
 * ========================= */
router.post("/holidays/import", async (req, res) => {
  try {
    const holidaysData = req.body;
    
    if (!Array.isArray(holidaysData) || holidaysData.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No holiday data provided" 
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Process each holiday
    for (const holidayData of holidaysData) {
      try {
        const { name, startDate, endDate, description } = holidayData;

        // Validate required fields
        if (!name || !startDate) {
          results.failed++;
          results.errors.push(`Missing required fields for holiday: ${name}`);
          continue;
        }

        // Check if holiday already exists
        const existing = await Holiday.findOne({
          name,
          startDate: new Date(startDate)
        });

        if (existing) {
          results.failed++;
          results.errors.push(`Holiday "${name}" on ${startDate} already exists`);
          continue;
        }

        const holiday = new Holiday({
          name,
          startDate: new Date(startDate),
          endDate: new Date(endDate || startDate),
          description: description || "",
          type: "General",
          enabled: true
        });

        await holiday.save();
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Error processing holiday: ${error.message}`);
      }
    }

    res.json({
      success: true,
      message: `Import completed: ${results.success} successful, ${results.failed} failed`,
      details: results
    });

  } catch (error) {
    console.error("Error importing holidays:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while importing holidays" 
    });
  }
});

export default router;