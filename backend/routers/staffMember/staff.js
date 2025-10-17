import express from "express";
import staffSchema from "../../models/staffMember/staff.js";

const router = express.Router();

const handleServerError = (res, err, message = "Server error", code = 500) => {
  console.error("❌ [ERROR]:", err);
  res.status(code).json({ message, error: err.message || err });
};

router.get("/staffs", async (_, res) => {
  try {
    const staff = await staffSchema.find();
    res.json(staff);
  } catch (err) {
    handleServerError(res, err);
  }
});

router.get("/staff/teams", async (_, res) => {
  try {
    const staff = await staffSchema.find({}, "teamName"); 
    const teams = [
      ...new Set(staff.map((s) => s.teamName?.trim()).filter(Boolean))
    ];

    res.json(teams);
  } catch (err) {
    handleServerError(res, err);
  }
});

router.get("/staffs/:id", async (req, res) => {
  try {
    const staff = await staffSchema.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: "Staff not found" });
    res.json(staff);
  } catch (err) {
    handleServerError(res, err);
  }
});

// ✅ Route: Create staff
router.post("/staffs", async (req, res) => {
  try {
    const { medicalRepName, enabled, contactNo, email } = req.body;
    const existingStaff = await staffSchema.findOne({ medicalRepName });

    if (existingStaff) {
      return res.status(409).json({
        message: `Staff member with name <b>${medicalRepName}</b> already exists.`,
        ok: false,
      });
    }
    const isEnabled = enabled === "enabled";

    const newStaff = new staffSchema({
      ...req.body,
      enabled: isEnabled,
    });

    const savedStaff = await newStaff.save();

    res.status(201).json({
      message: `Staff member <b>${savedStaff.medicalRepName}</b> created successfully`,
      ok: true,
    });
  } catch (err) {
    res.status(400).json({
      message: "Invalid data provided",
      error: err.message,
      ok: false,
    });
  }
});

// ✅ Route: Update staff
router.put("/staff/:id", async (req, res) => {
  try {
    const updatedStaff = await staffSchema.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true, // Return the updated document
        runValidators: true, // Enforce schema validation
      }
    );

    if (!updatedStaff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    res.json(updatedStaff);
  } catch (err) {
    res.status(400).json({ message: "Invalid data", error: err.message });
  }
});

// ✅ Route: Delete multiple staff
router.delete("/staffs", async (req, res) => {
  const ids = req.body;
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No staff IDs provided" });
    }

    const result = await staffSchema.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `${result.deletedCount} staff(s) deleted successfully`,
    });
  } catch (err) {
    console.error("❌ Error deleting staff:", err);
    handleServerError(res, err);
  }
});

// ✅ DELETE /staff/:id — delete one staff by ID
router.delete("/staff/:id", async (req, res) => {
  try {
    const deleted = await staffSchema.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Staff not found" });
    }

    res.json({
      message: `Staff <b>${deleted.medicalRepName}</b> deleted successfully`,
      ok: true,
    });
  } catch (err) {
    console.error("🔴 Error deleting single staff:", err);
    handleServerError(res, err);
  }
});

router.post("/staffs/import", async (req, res) => {
  try {
    const staffList = req.body;
    if (!Array.isArray(staffList)) {
      return res.status(400).json({
        message: "Invalid data format. Expected an array of staffs.",
      });
    }

    const requiredFields = ["medicalRepName", "teamName"]; // Changed from ["mrName", "teamName"]

    for (const staff of staffList) {
      for (const field of requiredFields) {
        if (
          !staff.hasOwnProperty(field) ||
          staff[field] === undefined ||
          staff[field] === null ||
          staff[field] === ""
        ) {
          return res.status(400).json({
            message: `Missing required field '${field}' in one or more records.`,
          });
        }
      }

      const staffData = {
        medicalRepName: staff.medicalRepName, // Direct mapping
        teamName: staff.teamName, // Direct mapping
        contactNo: staff.contactNo || "", // Add contactNo field
        email: staff.email || "", // Add email field
      };

      const existingStaff = await staffSchema.findOne({
        medicalRepName: staffData.medicalRepName,
      });

      if (!existingStaff) {
        await staffSchema.create(staffData);
      }
    }

    res.status(200).json({ message: "Staff imported successfully." });
  } catch (err) {
    console.error("❌ Error importing staff:", err);
    handleServerError(res, err, "Error importing staff");
  }
});

export default router;