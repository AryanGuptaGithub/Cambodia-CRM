import express from "express";
import Holiday from "../../models/Hrm/Holidays.js";
import { body, validationResult } from "express-validator";

const router = express.Router();

/** =========================
 *   GET / (all holidays)
 * ========================= */
router.get("/", async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ startDate: 1 }).lean();
    res.json({ success: true, holidays });
  } catch (error) {
    console.error("Error fetching holidays:", error);
    res.status(500).json({ success: false, message: "Server error while fetching holidays" });
  }
});

/** =========================
 *   POST / (create holiday)
 * ========================= */
router.post(
  "/",
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
 *   PUT /:id
 * ========================= */
router.put(
  "/:id",
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
 *   DELETE /:id
 * ========================= */
router.delete("/:id", async (req, res) => {
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
 *   DELETE / (bulk delete)
 * ========================= */
router.delete("/", async (req, res) => {
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
 *   POST /import
 * ========================= */
router.post("/import", async (req, res) => {
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
      errors: [],
      importedHolidays: []
    };

    for (const [index, holidayData] of holidaysData.entries()) {
      try {
        const { name, startDate, endDate, description } = holidayData;
        
        // Validate required fields
        if (!name || !startDate) {
          results.failed++;
          results.errors.push(
            `Row ${index + 1}: Missing required fields - name and start date are required`
          );
          continue;
        }

        // Parse dates - ensure they're valid
        const start = new Date(startDate);
        const end = new Date(endDate || startDate);

        if (isNaN(start.getTime())) {
          results.failed++;
          results.errors.push(
            `Row ${index + 1}: Invalid start date format - ${startDate}`
          );
          continue;
        }

        if (isNaN(end.getTime())) {
          results.failed++;
          results.errors.push(
            `Row ${index + 1}: Invalid end date format - ${endDate}`
          );
          continue;
        }

        if (end < start) {
          results.failed++;
          results.errors.push(
            `Row ${index + 1}: End date cannot be before start date`
          );
          continue;
        }

        // Extract year from start date for yearCode
        const year = start.getFullYear();
        
        // Check for duplicate holidays
        const existing = await Holiday.findOne({
          name: name.trim(),
          startDate: start
        });

        if (existing) {
          results.failed++;
          results.errors.push(
            `Row ${index + 1}: Holiday "${name.trim()}" on ${start.toDateString()} already exists`
          );
          continue;
        }

        const holiday = new Holiday({
          name: name.trim(),
          startDate: start,
          endDate: end,
          description: description ? description.trim() : "",
          yearCode: [year.toString()], // Add yearCode for filtering
          enabled: true
        });

        const savedHoliday = await holiday.save();
        results.success++;
        results.importedHolidays.push({
          name: savedHoliday.name,
          startDate: savedHoliday.startDate,
          endDate: savedHoliday.endDate,
          description: savedHoliday.description,
          yearCode: savedHoliday.yearCode
        });

      } catch (error) {
        console.error(`🔥 Error at row ${index + 1}:`, error);
        results.failed++;
        results.errors.push(`Row ${index + 1}: ${error.message}`);
      }
    }

    let message;
    if (results.success === holidaysData.length) {
      message = `All ${results.success} holidays imported successfully`;
    } else if (results.success > 0) {
      message = `Import partially completed: ${results.success} successful, ${results.failed} failed`;
    } else {
      message = `Import failed: All ${results.failed} holidays failed to import`;
    }

    res.json({
      success: results.success > 0,
      message,
      importedCount: results.success,
      failedCount: results.failed,
      errors: results.errors,
      importedHolidays: results.importedHolidays
    });

  } catch (error) {
    console.error("🚨 Fatal error importing holidays:", error);
    res.status(500).json({
      success: false,
      message: "Server error while importing holidays",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

export default router;