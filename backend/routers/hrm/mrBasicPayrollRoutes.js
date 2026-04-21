import express from "express";
import MRBasicPayroll from "../../models/Hrm/MRBasicPayroll.js";
import MR from "../../models/staffMember/staff.js";
import { body, validationResult } from "express-validator";
import { logActivity } from "../activity/activityLog.js";

const router = express.Router();

// ─── Utility helpers ──────────────────────────────────────────────────────────

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
};

// Validation middleware
const validateMRBasicPayroll = [
  body("employeeId").notEmpty().withMessage("Employee ID is required"),
  body("basicSalary")
    .isFloat({ min: 0 })
    .withMessage("Basic salary must be a positive number"),
  body("effectiveFrom")
    .isISO8601()
    .withMessage("Effective from date must be in ISO format (YYYY-MM-DD)"),
  body("remarks").optional().isString(),
];

// Helper function to get basic salary for period
const getBasicSalaryForPeriod = (payroll, period) => {
  if (
    !payroll ||
    !payroll.salaryHistory ||
    payroll.salaryHistory.length === 0
  ) {
    return 0;
  }

  const targetDate = new Date(period + "-01");
  const activeSalary = payroll.salaryHistory.find((entry) => {
    const effectiveFrom = new Date(entry.effectiveFrom);
    const effectiveUntil = entry.effectiveUntil
      ? new Date(entry.effectiveUntil)
      : null;

    return (
      effectiveFrom <= targetDate &&
      (effectiveUntil === null || effectiveUntil >= targetDate)
    );
  });

  return activeSalary
    ? activeSalary.basicSalary
    : payroll.currentBasicSalary || 0;
};

// GET all MRs for dropdown/selection - EXCLUDE MRs that already have payroll
router.get("/mrs/available", async (req, res) => {
  try {
    const existingPayrolls = await MRBasicPayroll.find({})
      .select("employeeId")
      .lean();

    const payrollEmployeeIds = existingPayrolls.map((p) =>
      p.employeeId.toString(),
    );

    const allMrs = await MR.find({})
      .select("_id medicalRepName teamName contactNo email MRId")
      .sort({ medicalRepName: 1 })
      .lean();

    const availableMrs = allMrs.filter(
      (mr) => !payrollEmployeeIds.includes(mr._id.toString()),
    );

    res.status(200).json({
      success: true,
      count: availableMrs.length,
      data: availableMrs,
      message:
        availableMrs.length === 0
          ? "No available MRs without payroll records"
          : "Available MRs fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching available MR list:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR list",
      error: error.message,
    });
  }
});

// GET all MRs (for reference, not filtered)
router.get("/mrs/all", async (req, res) => {
  try {
    const allMrs = await MR.find({})
      .select("_id medicalRepName teamName contactNo email MRId")
      .sort({ medicalRepName: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: allMrs.length,
      data: allMrs,
    });
  } catch (error) {
    console.error("Error fetching all MR list:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR list",
      error: error.message,
    });
  }
});

// GET all MR Basic Payrolls with pagination and search
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { employeeId: { $regex: search, $options: "i" } },
        { employeeName: { $regex: search, $options: "i" } },
        { remarks: { $regex: search, $options: "i" } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (page - 1) * limit;

    const payrolls = await MRBasicPayroll.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const payrollsWithDetails = await Promise.all(
      payrolls.map(async (payroll) => {
        try {
          const mrDetails = await MR.findById(payroll.employeeId)
            .select("_id medicalRepName teamName contactNo email MRId")
            .lean();

          return {
            ...payroll,
            mrDetails: mrDetails || null,
            employeeName: mrDetails
              ? mrDetails.medicalRepName
              : payroll.employeeName,
            currentBasicSalary: payroll.currentBasicSalary,
            currentEffectiveFrom: payroll.currentEffectiveFrom,
            salaryHistoryCount: payroll.salaryHistory
              ? payroll.salaryHistory.length
              : 0,
          };
        } catch (err) {
          return {
            ...payroll,
            mrDetails: null,
            salaryHistoryCount: payroll.salaryHistory
              ? payroll.salaryHistory.length
              : 0,
          };
        }
      }),
    );

    const total = await MRBasicPayroll.countDocuments(query);

    res.status(200).json({
      success: true,
      data: payrollsWithDetails,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching MR basic payrolls:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR basic payrolls",
      error: error.message,
    });
  }
});

// GET single MR Basic Payroll by ID with salary history
router.get("/:id", async (req, res) => {
  try {
    const payroll = await MRBasicPayroll.findById(req.params.id);

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "MR Basic Payroll not found",
      });
    }

    let mrDetails = null;
    try {
      mrDetails = await MR.findById(payroll.employeeId).select(
        "_id medicalRepName teamName contactNo email MRId",
      );
    } catch (err) {
      console.log("Could not fetch MR details:", err.message);
    }

    const sortedHistory = payroll.salaryHistory.sort(
      (a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom),
    );

    const responseData = {
      ...payroll.toObject(),
      mrDetails: mrDetails,
      salaryHistory: sortedHistory,
    };

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching MR basic payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR basic payroll",
      error: error.message,
    });
  }
});

// GET basic salary for specific period
router.get("/:employeeId/salary/:period", async (req, res) => {
  try {
    const { employeeId, period } = req.params;

    const payroll = await MRBasicPayroll.findOne({ employeeId });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "MR Basic Payroll not found for this employee",
      });
    }

    const basicSalary = getBasicSalaryForPeriod(payroll, period);

    res.status(200).json({
      success: true,
      data: {
        employeeId,
        period,
        basicSalary,
        salaryHistory: payroll.salaryHistory,
      },
    });
  } catch (error) {
    console.error("Error fetching salary for period:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch salary for period",
      error: error.message,
    });
  }
});

// POST create new MR Basic Payroll (with initial salary history)
router.post("/", validateMRBasicPayroll, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const mrExists = await MR.findById(req.body.employeeId);
    if (!mrExists) {
      return res.status(400).json({
        success: false,
        message: "MR not found with the provided employee ID",
      });
    }

    const existingPayroll = await MRBasicPayroll.findOne({
      employeeId: req.body.employeeId,
    });

    if (existingPayroll) {
      return res.status(409).json({
        success: false,
        message: "Payroll already exists for this employee",
      });
    }

    const effectiveFrom = new Date(req.body.effectiveFrom);
    const basicSalary = parseFloat(req.body.basicSalary) || 0;
    const employeeName =
      mrExists.medicalRepName || mrExists.employeeName || mrExists.name || "";

    const payrollData = {
      employeeId: req.body.employeeId,
      employeeName: employeeName,
      currentBasicSalary: basicSalary,
      currentEffectiveFrom: effectiveFrom,
      remarks: req.body.remarks || "",
      salaryHistory: [
        {
          basicSalary: basicSalary,
          effectiveFrom: effectiveFrom,
          effectiveUntil: null,
          remarks: req.body.remarks || "Initial salary",
        },
      ],
    };

    const payroll = new MRBasicPayroll(payrollData);
    await payroll.save();

    // Log activity for CREATE
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Payroll for ${toTitleCase(employeeName)}`,
      tableName: "mrbasicpayrolls",
      tableLabel: "MR Basic Payroll",
      recordId: payroll._id,
      referenceNumber: mrExists.MRId || employeeName,
      newData: payroll.toObject(),
      description: `Payroll created for ${toTitleCase(employeeName)} with basic salary ${formatCurrency(basicSalary)} effective from ${effectiveFrom.toISOString().split("T")[0]}`,
      refField: "employeeName",
    });

    res.status(201).json({
      success: true,
      message: "MR Basic Payroll created successfully",
      data: payroll,
    });
  } catch (error) {
    console.error("Error creating MR basic payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create MR basic payroll",
      error: error.message,
    });
  }
});

// PUT update MR Basic Payroll (add new salary entry)
router.put(
  "/:id",
  [
    body("basicSalary")
      .isFloat({ min: 0 })
      .withMessage("Basic salary must be a positive number"),
    body("effectiveFrom")
      .isISO8601()
      .withMessage("Effective from date must be in ISO format"),
    body("remarks").optional().isString(),
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

      // Get previous record for logging
      const previousPayroll = await MRBasicPayroll.findById(
        req.params.id,
      ).lean();

      if (!previousPayroll) {
        return res.status(404).json({
          success: false,
          message: "MR Basic Payroll not found",
        });
      }

      const payroll = await MRBasicPayroll.findById(req.params.id);

      const basicSalary = parseFloat(req.body.basicSalary) || 0;
      const effectiveFrom = new Date(req.body.effectiveFrom);
      const remarks = req.body.remarks || "";

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (effectiveFrom < today) {
        return res.status(400).json({
          success: false,
          message: "Effective date cannot be in the past for salary updates",
        });
      }

      const oldBasicSalary = payroll.currentBasicSalary;
      const oldEffectiveFrom = payroll.currentEffectiveFrom;

      await payroll.addSalaryEntry(basicSalary, effectiveFrom, remarks);

      if (req.body.remarks !== undefined) {
        payroll.remarks = req.body.remarks;
      }

      await payroll.save();

      // Log activity for UPDATE (Salary Update)
      await logActivity(req, {
        action: "UPDATE",
        actionLabel: `Updated Salary for ${toTitleCase(payroll.employeeName)}`,
        tableName: "mrbasicpayrolls",
        tableLabel: "MR Basic Payroll",
        recordId: payroll._id,
        referenceNumber: payroll.employeeName,
        previousData: {
          basicSalary: oldBasicSalary,
          effectiveFrom: oldEffectiveFrom,
          remarks: previousPayroll.remarks,
        },
        newData: {
          basicSalary: basicSalary,
          effectiveFrom: effectiveFrom,
          remarks: remarks,
          salaryHistoryLength: payroll.salaryHistory.length,
        },
        description: `Salary updated for ${toTitleCase(payroll.employeeName)} from ${formatCurrency(oldBasicSalary)} to ${formatCurrency(basicSalary)} effective from ${effectiveFrom.toISOString().split("T")[0]}`,
        refField: "employeeName",
      });

      res.status(200).json({
        success: true,
        message: "MR Basic Payroll updated successfully with new salary entry",
        data: payroll,
      });
    } catch (error) {
      console.error("Error updating MR basic payroll:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update MR basic payroll",
        error: error.message,
      });
    }
  },
);

// PATCH update only remarks (without changing salary)
router.patch("/:id/remarks", async (req, res) => {
  try {
    const { remarks } = req.body;

    if (!remarks) {
      return res.status(400).json({
        success: false,
        message: "Remarks is required",
      });
    }

    // Get previous record for logging
    const previousPayroll = await MRBasicPayroll.findById(req.params.id).lean();

    if (!previousPayroll) {
      return res.status(404).json({
        success: false,
        message: "MR Basic Payroll not found",
      });
    }

    const payroll = await MRBasicPayroll.findByIdAndUpdate(
      req.params.id,
      { remarks },
      { new: true },
    );

    // Log activity for REMARKS UPDATE
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Remarks for ${toTitleCase(payroll.employeeName)}`,
      tableName: "mrbasicpayrolls",
      tableLabel: "MR Basic Payroll",
      recordId: payroll._id,
      referenceNumber: payroll.employeeName,
      previousData: { remarks: previousPayroll.remarks },
      newData: { remarks: remarks },
      description: `Remarks updated for ${toTitleCase(payroll.employeeName)} payroll`,
      refField: "employeeName",
    });

    res.status(200).json({
      success: true,
      message: "Remarks updated successfully",
      data: payroll,
    });
  } catch (error) {
    console.error("Error updating remarks:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update remarks",
      error: error.message,
    });
  }
});

// DELETE single MR Basic Payroll
router.delete("/:id", async (req, res) => {
  try {
    // Get payroll details before deletion for logging
    const payrollToDelete = await MRBasicPayroll.findById(req.params.id).lean();

    if (!payrollToDelete) {
      return res.status(404).json({
        success: false,
        message: "MR Basic Payroll not found",
      });
    }

    const payroll = await MRBasicPayroll.findByIdAndDelete(req.params.id);

    // Log activity for DELETE
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Payroll for ${toTitleCase(payrollToDelete.employeeName)}`,
      tableName: "mrbasicpayrolls",
      tableLabel: "MR Basic Payroll",
      recordId: payrollToDelete._id,
      referenceNumber: payrollToDelete.employeeName,
      previousData: payrollToDelete,
      description: `Payroll for ${toTitleCase(payrollToDelete.employeeName)} with salary ${formatCurrency(payrollToDelete.currentBasicSalary)} was permanently deleted`,
      refField: "employeeName",
    });

    res.status(200).json({
      success: true,
      message: "MR Basic Payroll deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting MR basic payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete MR basic payroll",
      error: error.message,
    });
  }
});

// DELETE bulk MR Basic Payrolls
router.delete("/", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of payroll IDs to delete",
      });
    }

    // Get payrolls to delete for logging
    const payrollsToDelete = await MRBasicPayroll.find({
      _id: { $in: ids },
    }).lean();

    if (payrollsToDelete.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No payroll records found for the provided IDs",
      });
    }

    const result = await MRBasicPayroll.deleteMany({ _id: { $in: ids } });

    // Log activity for BULK DELETE
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Payroll Record(s)`,
      tableName: "mrbasicpayrolls",
      tableLabel: "MR Basic Payroll",
      previousData: payrollsToDelete,
      description: `Deleted ${result.deletedCount} payroll records for: ${payrollsToDelete.map((p) => toTitleCase(p.employeeName)).join(", ")}`,
      refField: "employeeName",
    });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} MR Basic Payroll(s) deleted successfully`,
    });
  } catch (error) {
    console.error("Error bulk deleting MR basic payrolls:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete MR basic payrolls",
      error: error.message,
    });
  }
});

// GET salary history for an employee
router.get("/:employeeId/history", async (req, res) => {
  try {
    const payroll = await MRBasicPayroll.findOne({
      employeeId: req.params.employeeId,
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "MR Basic Payroll not found",
      });
    }

    const sortedHistory = payroll.salaryHistory.sort(
      (a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom),
    );

    res.status(200).json({
      success: true,
      data: {
        employeeId: payroll.employeeId,
        employeeName: payroll.employeeName,
        currentBasicSalary: payroll.currentBasicSalary,
        currentEffectiveFrom: payroll.currentEffectiveFrom,
        salaryHistory: sortedHistory,
      },
    });
  } catch (error) {
    console.error("Error fetching salary history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch salary history",
      error: error.message,
    });
  }
});

// POST add new salary entry to existing payroll
router.post(
  "/:id/salary",
  [
    body("basicSalary")
      .isFloat({ min: 0 })
      .withMessage("Basic salary must be a positive number"),
    body("effectiveFrom")
      .isISO8601()
      .withMessage("Effective from date must be in ISO format"),
    body("remarks").optional().isString(),
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

      // Get previous record for logging
      const previousPayroll = await MRBasicPayroll.findById(
        req.params.id,
      ).lean();

      if (!previousPayroll) {
        return res.status(404).json({
          success: false,
          message: "MR Basic Payroll not found",
        });
      }

      const payroll = await MRBasicPayroll.findById(req.params.id);

      const basicSalary = parseFloat(req.body.basicSalary) || 0;
      const effectiveFrom = new Date(req.body.effectiveFrom);
      const remarks = req.body.remarks || "";

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (effectiveFrom < today) {
        return res.status(400).json({
          success: false,
          message:
            "Effective date cannot be in the past for new salary entries",
        });
      }

      if (effectiveFrom <= payroll.currentEffectiveFrom) {
        return res.status(400).json({
          success: false,
          message:
            "New effective date must be after the current effective date",
        });
      }

      const oldBasicSalary = payroll.currentBasicSalary;

      await payroll.addSalaryEntry(basicSalary, effectiveFrom, remarks);

      // Log activity for ADD SALARY ENTRY
      await logActivity(req, {
        action: "UPDATE",
        actionLabel: `Added Salary Entry for ${toTitleCase(payroll.employeeName)}`,
        tableName: "mrbasicpayrolls",
        tableLabel: "MR Basic Payroll",
        recordId: payroll._id,
        referenceNumber: payroll.employeeName,
        previousData: {
          basicSalary: oldBasicSalary,
          effectiveFrom: payroll.currentEffectiveFrom,
          salaryHistoryCount: previousPayroll.salaryHistory?.length || 0,
        },
        newData: {
          basicSalary: basicSalary,
          effectiveFrom: effectiveFrom,
          salaryHistoryCount: payroll.salaryHistory.length,
          remarks: remarks,
        },
        description: `New salary entry added for ${toTitleCase(payroll.employeeName)}: ${formatCurrency(basicSalary)} effective from ${effectiveFrom.toISOString().split("T")[0]}`,
        refField: "employeeName",
      });

      res.status(200).json({
        success: true,
        message: "New salary entry added successfully",
        data: payroll,
      });
    } catch (error) {
      console.error("Error adding salary entry:", error);
      res.status(500).json({
        success: false,
        message: "Failed to add salary entry",
        error: error.message,
      });
    }
  },
);

// POST /import - Bulk import payroll records
router.post("/import", async (req, res) => {
  try {
    const { payrolls } = req.body;

    if (!payrolls || !Array.isArray(payrolls) || payrolls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of payroll records to import",
      });
    }

    const results = {
      inserted: [],
      errors: [],
      duplicates: [],
    };

    for (let i = 0; i < payrolls.length; i++) {
      const item = payrolls[i];
      const rowNumber = i + 1;

      try {
        // Check if MR exists
        const mrExists = await MR.findById(item.employeeId);
        if (!mrExists) {
          results.errors.push({
            row: rowNumber,
            employeeId: item.employeeId,
            reason: "MR not found",
          });
          continue;
        }

        // Check if payroll already exists
        const existingPayroll = await MRBasicPayroll.findOne({
          employeeId: item.employeeId,
        });

        if (existingPayroll) {
          results.duplicates.push({
            row: rowNumber,
            employeeId: item.employeeId,
            employeeName: mrExists.medicalRepName,
            reason: "Payroll already exists for this employee",
          });
          continue;
        }

        const effectiveFrom = new Date(item.effectiveFrom);
        const basicSalary = parseFloat(item.basicSalary) || 0;
        const employeeName =
          mrExists.medicalRepName || mrExists.employeeName || "";

        const payrollData = {
          employeeId: item.employeeId,
          employeeName: employeeName,
          currentBasicSalary: basicSalary,
          currentEffectiveFrom: effectiveFrom,
          remarks: item.remarks || "",
          salaryHistory: [
            {
              basicSalary: basicSalary,
              effectiveFrom: effectiveFrom,
              effectiveUntil: null,
              remarks: item.remarks || "Initial salary (imported)",
            },
          ],
        };

        const payroll = new MRBasicPayroll(payrollData);
        await payroll.save();

        results.inserted.push({
          row: rowNumber,
          employeeId: item.employeeId,
          employeeName: employeeName,
          basicSalary: basicSalary,
          effectiveFrom: effectiveFrom,
        });
      } catch (error) {
        results.errors.push({
          row: rowNumber,
          employeeId: item.employeeId,
          reason: error.message,
        });
      }
    }

    // Log activity for BULK IMPORT
    if (results.inserted.length > 0) {
      await logActivity(req, {
        action: "IMPORT",
        actionLabel: `Bulk Imported ${results.inserted.length} Payroll Record(s)`,
        tableName: "mrbasicpayrolls",
        tableLabel: "MR Basic Payroll",
        description: `Imported ${results.inserted.length} payroll records. Duplicates skipped: ${results.duplicates.length}. Errors: ${results.errors.length}.`,
        newData: {
          importedCount: results.inserted.length,
          duplicateCount: results.duplicates.length,
          errorCount: results.errors.length,
          importedEmployees: results.inserted.map((i) => i.employeeName),
        },
        refField: "employeeName",
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully imported ${results.inserted.length} payroll records`,
      data: results,
    });
  } catch (error) {
    console.error("Error bulk importing payrolls:", error);
    res.status(500).json({
      success: false,
      message: "Failed to import payroll records",
      error: error.message,
    });
  }
});

// GET /export - Export payroll records to Excel
router.get("/export", async (req, res) => {
  try {
    const payrolls = await MRBasicPayroll.find({})
      .populate("employeeId", "medicalRepName MRId teamName contactNo")
      .lean();

    const exportData = payrolls.map((payroll) => {
      const mrDetails = payroll.employeeId || {};
      return {
        "MR ID": mrDetails.MRId || "",
        "MR Name": toTitleCase(payroll.employeeName),
        Team: mrDetails.teamName || "",
        Contact: mrDetails.contactNo || "",
        "Current Basic Salary": payroll.currentBasicSalary,
        "Current Effective From": payroll.currentEffectiveFrom
          ? new Date(payroll.currentEffectiveFrom).toISOString().split("T")[0]
          : "",
        "Salary History Count": payroll.salaryHistory?.length || 0,
        Remarks: payroll.remarks || "",
        "Created At": payroll.createdAt
          ? new Date(payroll.createdAt).toISOString().split("T")[0]
          : "",
        "Last Updated": payroll.updatedAt
          ? new Date(payroll.updatedAt).toISOString().split("T")[0]
          : "",
      };
    });

    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "MR Basic Payrolls");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    await logActivity(req, {
      action: "EXPORT",
      actionLabel: `Exported Payroll List (${payrolls.length} records)`,
      tableName: "mrbasicpayrolls",
      tableLabel: "MR Basic Payroll",
      description: `Exported ${payrolls.length} payroll records to Excel`,
      newData: { count: payrolls.length },
      refField: "employeeName",
    });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=mr_basic_payrolls.xlsx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  } catch (error) {
    console.error("Error exporting payrolls:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export payroll records",
      error: error.message,
    });
  }
});

export default router;
