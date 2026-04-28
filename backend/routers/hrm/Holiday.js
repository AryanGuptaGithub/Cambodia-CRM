import express from "express";
import Holiday from "../../models/Hrm/Holidays.js";
import { body, validationResult } from "express-validator";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";

const router = express.Router();

// Utility helpers
const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatDateForLog = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
};

/** =========================
 *   GET / (all holidays)
 * ========================= */
router.get("/", async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ startDate: 1 }).lean();
    res.json({ success: true, holidays });
  } catch (error) {
    console.error("Error fetching holidays:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching holidays",
    });
  }
});

/** =========================
 *   POST / (create holiday) with activity logging
 * ========================= */
router.post(
  "/",
  protect,
  allowAdminOnly,
  [
    body("name").notEmpty().withMessage("Holiday name is required"),
    body("startDate").isISO8601().withMessage("Valid start date is required"),
    body("endDate")
      .optional()
      .isISO8601()
      .withMessage("Valid end date is required"),
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

      const {
        name,
        startDate,
        endDate,
        description,
        type,
        enabled = true,
      } = req.body;

      // Use startDate as endDate if endDate is not provided
      const finalEndDate = endDate || startDate;

      // Check if end date is before start date
      if (new Date(finalEndDate) < new Date(startDate)) {
        return res.status(400).json({
          success: false,
          message: "End date cannot be before start date",
        });
      }

      // Generate year codes for all years between start and end date
      const startYear = new Date(startDate).getFullYear();
      const endYear = new Date(finalEndDate).getFullYear();
      const yearCodes = [];
      for (let year = startYear; year <= endYear; year++) {
        yearCodes.push(year.toString());
      }

      // Prevent duplicate holidays on same start date with same name
      const existing = await Holiday.findOne({
        name,
        startDate: new Date(startDate),
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Holiday with the same name and start date already exists",
        });
      }

      const holiday = new Holiday({
        name,
        startDate: new Date(startDate),
        endDate: new Date(finalEndDate),
        type: type || "General",
        description: description || "",
        enabled,
        yearCode: yearCodes,
      });

      await holiday.save();

      // Log activity
      await logActivity(req, {
        action: "CREATE",
        actionLabel: `Created Holiday: ${toTitleCase(holiday.name)}`,
        tableName: "holidays",
        tableLabel: "Holiday",
        recordId: holiday._id,
        referenceNumber: holiday.name,
        newData: holiday.toObject(),
        description: `New holiday "${toTitleCase(holiday.name)}" created from ${formatDateForLog(holiday.startDate)} to ${formatDateForLog(holiday.endDate)}`,
        refField: "name",
      });

      res.status(201).json({
        success: true,
        message: "Holiday created successfully",
        holiday,
      });
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({
        success: false,
        message: "Server error while creating holiday",
      });
    }
  },
);

/** =========================
 *   PUT /:id (update holiday) with activity logging
 * ========================= */
router.put(
  "/:id",
  protect,
  allowAdminOnly,
  [
    body("name").notEmpty().withMessage("Holiday name is required"),
    body("startDate").isISO8601().withMessage("Valid start date is required"),
    body("endDate")
      .optional()
      .isISO8601()
      .withMessage("Valid end date is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id } = req.params;
      const { name, startDate, endDate, description, type, enabled } = req.body;

      // Get previous record for logging
      const previousRecord = await Holiday.findById(id).lean();
      if (!previousRecord) {
        return res
          .status(404)
          .json({ success: false, message: "Holiday not found" });
      }

      // Use startDate as endDate if endDate is not provided
      const finalEndDate = endDate || startDate;

      // Check if end date is before start date
      if (new Date(finalEndDate) < new Date(startDate)) {
        return res.status(400).json({
          success: false,
          message: "End date cannot be before start date",
        });
      }

      // Generate year codes for all years between start and end date
      const startYear = new Date(startDate).getFullYear();
      const endYear = new Date(finalEndDate).getFullYear();
      const yearCodes = [];
      for (let year = startYear; year <= endYear; year++) {
        yearCodes.push(year.toString());
      }

      const updated = await Holiday.findByIdAndUpdate(
        id,
        {
          name,
          startDate: new Date(startDate),
          endDate: new Date(finalEndDate),
          description,
          type,
          enabled,
          yearCode: yearCodes,
        },
        { new: true },
      );

      if (!updated) {
        return res
          .status(404)
          .json({ success: false, message: "Holiday not found" });
      }

      // Log activity
      await logActivity(req, {
        action: "UPDATE",
        actionLabel: `Updated Holiday: ${toTitleCase(updated.name)}`,
        tableName: "holidays",
        tableLabel: "Holiday",
        recordId: updated._id,
        referenceNumber: updated.name,
        previousData: previousRecord,
        newData: updated.toObject(),
        description: `Holiday "${toTitleCase(updated.name)}" was updated`,
        refField: "name",
      });

      res.json({
        success: true,
        message: "Holiday updated successfully",
        holiday: updated,
      });
    } catch (error) {
      console.error("Error updating holiday:", error);
      res.status(500).json({
        success: false,
        message: "Server error while updating holiday",
      });
    }
  },
);

/** =========================
 *   DELETE /:id (single holiday) with activity logging
 * ========================= */
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // Get full record before deletion for logging
    const deleted = await Holiday.findById(id);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Holiday not found" });
    }

    await Holiday.findByIdAndDelete(id);

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Holiday: ${toTitleCase(deleted.name)}`,
      tableName: "holidays",
      tableLabel: "Holiday",
      recordId: deleted._id,
      referenceNumber: deleted.name,
      previousData: deleted.toObject(),
      description: `Holiday "${toTitleCase(deleted.name)}" (${formatDateForLog(deleted.startDate)} to ${formatDateForLog(deleted.endDate)}) permanently deleted`,
      refField: "name",
    });

    res.json({ success: true, message: "Holiday deleted successfully" });
  } catch (error) {
    console.error("Error deleting holiday:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while deleting holiday" });
  }
});

/** =========================
 *   DELETE / (bulk delete) with activity logging
 * ========================= */
router.delete("/", protect, allowAdminOnly, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No holidays selected" });
    }

    // Get full records before deletion for logging
    const toDelete = await Holiday.find({ _id: { $in: ids } }).lean();
    const result = await Holiday.deleteMany({ _id: { $in: ids } });

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Holiday(s)`,
      tableName: "holidays",
      tableLabel: "Holiday",
      previousData: toDelete,
      description: `Deleted ${result.deletedCount} holidays: ${toDelete.map((h) => h.name).join(", ")}`,
      refField: "name",
    });

    res.json({
      success: true,
      message: `${result.deletedCount} holidays deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error bulk deleting holidays:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting holidays",
    });
  }
});

/** =========================
 *   POST /import (bulk import) with activity logging
 * ========================= */
router.post("/import", protect, allowAdminOnly, async (req, res) => {
  try {
    const holidaysData = req.body;
    if (!Array.isArray(holidaysData) || holidaysData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No holiday data provided",
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [],
      importedHolidays: [],
    };

    const importedHolidayObjects = [];

    for (const [index, holidayData] of holidaysData.entries()) {
      try {
        const { name, startDate, endDate, description } = holidayData;

        // Validate required fields
        if (!name || !startDate) {
          results.failed++;
          results.errors.push(
            `Row ${index + 1}: Missing required fields - name and start date are required`,
          );
          continue;
        }

        // Parse dates - ensure they're valid
        const start = new Date(startDate);
        const end = new Date(endDate || startDate);

        if (isNaN(start.getTime())) {
          results.failed++;
          results.errors.push(
            `Row ${index + 1}: Invalid start date format - ${startDate}`,
          );
          continue;
        }

        if (isNaN(end.getTime())) {
          results.failed++;
          results.errors.push(
            `Row ${index + 1}: Invalid end date format - ${endDate}`,
          );
          continue;
        }

        if (end < start) {
          results.failed++;
          results.errors.push(
            `Row ${index + 1}: End date cannot be before start date`,
          );
          continue;
        }

        // Extract all years between start and end date for yearCode
        const startYear = start.getFullYear();
        const endYear = end.getFullYear();
        const yearCodes = [];
        for (let year = startYear; year <= endYear; year++) {
          yearCodes.push(year.toString());
        }

        // Check for duplicate holidays
        const existing = await Holiday.findOne({
          name: name.trim(),
          startDate: start,
        });

        if (existing) {
          results.failed++;
          results.errors.push(
            `Row ${index + 1}: Holiday "${name.trim()}" on ${start.toDateString()} already exists`,
          );
          continue;
        }

        const holiday = new Holiday({
          name: name.trim(),
          startDate: start,
          endDate: end,
          description: description ? description.trim() : "",
          yearCode: yearCodes,
          enabled: true,
        });

        const savedHoliday = await holiday.save();
        results.success++;
        importedHolidayObjects.push(savedHoliday);
        results.importedHolidays.push({
          name: savedHoliday.name,
          startDate: savedHoliday.startDate,
          endDate: savedHoliday.endDate,
          description: savedHoliday.description,
          yearCode: savedHoliday.yearCode,
        });
      } catch (error) {
        console.error(`🔥 Error at row ${index + 1}:`, error);
        results.failed++;
        results.errors.push(`Row ${index + 1}: ${error.message}`);
      }
    }

    // Log activity if any holidays were imported
    if (results.success > 0) {
      await logActivity(req, {
        action: "IMPORT",
        actionLabel: `Bulk Imported ${results.success} Holiday(s)`,
        tableName: "holidays",
        tableLabel: "Holiday",
        description: `Imported ${results.success} holidays. Failed: ${results.failed}.`,
        newData: {
          importedCount: results.success,
          failedCount: results.failed,
          importedList: results.importedHolidays.map((h) => h.name),
        },
      });
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
      importedHolidays: results.importedHolidays,
    });
  } catch (error) {
    console.error("🚨 Fatal error importing holidays:", error);
    res.status(500).json({
      success: false,
      message: "Server error while importing holidays",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/** =========================
 *   GET /export (export holidays) with activity logging
 * ========================= */
router.get("/export", protect, allowAdminOnly, async (req, res) => {
  try {
    const holidays = await Holiday.find({}).sort({ startDate: 1 }).lean();

    const data = holidays.map((holiday) => ({
      "Holiday Name": holiday.name,
      "Start Date": formatDateForLog(holiday.startDate),
      "End Date": formatDateForLog(holiday.endDate),
      Type: holiday.type || "General",
      Description: holiday.description || "",
      Status: holiday.enabled ? "Active" : "Inactive",
      Year: holiday.yearCode ? holiday.yearCode.join(", ") : "",
    }));

    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Holidays");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    await logActivity(req, {
      action: "EXPORT",
      actionLabel: `Exported Holiday List (${holidays.length} records)`,
      tableName: "holidays",
      tableLabel: "Holiday",
      description: `Exported ${holidays.length} holidays to Excel`,
      newData: { count: holidays.length },
    });

    res.setHeader("Content-Disposition", "attachment; filename=holidays.xlsx");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export holidays",
    });
  }
});

/** =========================
 *   PUT /status/:id (toggle holiday status) with activity logging
 * ========================= */
router.put("/status/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    const previousRecord = await Holiday.findById(id).lean();
    if (!previousRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Holiday not found" });
    }

    const holiday = await Holiday.findByIdAndUpdate(
      id,
      { enabled },
      { new: true },
    );

    // Log activity
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `${enabled ? "Enabled" : "Disabled"} Holiday: ${toTitleCase(holiday.name)}`,
      tableName: "holidays",
      tableLabel: "Holiday",
      recordId: holiday._id,
      referenceNumber: holiday.name,
      previousData: { enabled: previousRecord.enabled },
      newData: { enabled: holiday.enabled },
      description: `Holiday "${toTitleCase(holiday.name)}" was ${enabled ? "enabled" : "disabled"}`,
      refField: "name",
    });

    res.json({
      success: true,
      message: `Holiday ${enabled ? "enabled" : "disabled"} successfully`,
      holiday,
    });
  } catch (error) {
    console.error("Error updating holiday status:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating holiday status",
    });
  }
});

export default router;
