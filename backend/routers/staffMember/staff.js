import express from "express";
import staffSchema from "../../models/staffMember/staff.js";

const router = express.Router();

const handleServerError = (res, err, message = "Server error", code = 500) => {
  console.error("❌ [ERROR]:", err);
  res.status(code).json({ message, error: err.message || err });
};

router.get("/staffs", async (_, res) => {
  try {
    const staff = await staffSchema
      .find()
      .sort({ updatedAt: -1, createdAt: -1 }); // newest first

    res.json(staff);
  } catch (err) {
    handleServerError(res, err);
  }
});

router.get("/staff/teams", async (_, res) => {
  try {
    const staff = await staffSchema.find({}, "teamName");
    const teams = [
      ...new Set(staff.map((s) => s.teamName?.trim()).filter(Boolean)),
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
    const { medicalRepName, teamName, contactNo, email, date, enabled } =
      req.body;

    // Check if staff member already exists
    const existingStaff = await staffSchema.findOne({ medicalRepName });
    if (existingStaff) {
      return res.status(409).json({
        message: `Staff member ${medicalRepName} already exists.`,
      });
    }

    // Check if contact number is already registered
    if (contactNo) {
      const existingContact = await staffSchema.findOne({ contactNo });
      if (existingContact) {
        return res.status(409).json({
          message: `Contact number ${contactNo} is already registered.`,
        });
      }
    }

    const isEnabled = enabled === "enabled";

    const newStaff = new staffSchema({
      medicalRepName,
      teamName,
      contactNo,
      email,
      date,
      enabled: isEnabled,
    });

    const savedStaff = await newStaff.save();

    res.status(201).json({
      message: `Staff member ${savedStaff.medicalRepName} created successfully`,
      ok: true,
    });
  } catch (err) {
    // Handle duplicate key error for contactNo
    if (err.code === 11000 && err.keyPattern && err.keyPattern.contactNo) {
      return res.status(409).json({
        message: "This contact number is already registered.",
        error: "Duplicate contact number",
        ok: false,
      });
    }

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
    const { contactNo, medicalRepName, ...updateData } = req.body;

    // Check if contact number is being updated and if it's already registered by another staff
    if (contactNo) {
      const existingContact = await staffSchema.findOne({
        contactNo,
        _id: { $ne: req.params.id }, // Exclude current staff member
      });

      if (existingContact) {
        return res.status(409).json({
          message: `Contact number ${contactNo} is already registered by another staff member.`,
        });
      }
    }

    // Check if medicalRepName is being updated to an existing one
    if (medicalRepName) {
      const existingStaff = await staffSchema.findOne({
        medicalRepName,
        _id: { $ne: req.params.id }, // Exclude current staff member
      });

      if (existingStaff) {
        return res.status(409).json({
          message: `Staff member name ${medicalRepName} already exists.`,
        });
      }
    }

    const updatedStaff = await staffSchema.findByIdAndUpdate(
      req.params.id,
      { ...updateData, contactNo, medicalRepName },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedStaff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    res.json(updatedStaff);
  } catch (err) {
    // Handle duplicate key error for contactNo
    if (err.code === 11000 && err.keyPattern && err.keyPattern.contactNo) {
      return res.status(409).json({
        message:
          "This contact number is already registered by another staff member.",
        error: "Duplicate contact number",
      });
    }

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

// ✅ Import route with duplicate contact number check
router.post("/staffs/import", async (req, res) => {
  try {
    const staffList = req.body;
    if (!Array.isArray(staffList)) {
      return res.status(400).json({
        message: "Invalid data format. Expected an array of staffs.",
      });
    }

    const requiredFields = ["medicalRepName", "teamName"];
    const duplicateContacts = [];
    const duplicateNames = [];

    // First pass: Check for duplicates in the import data and with existing data
    for (const staff of staffList) {
      for (const field of requiredFields) {
        if (!staff[field]) {
          return res.status(400).json({
            message: `Missing required field '${field}' in one or more records.`,
          });
        }
      }

      // Check for duplicate contact numbers in existing database
      if (staff.contactNo) {
        const existingContact = await staffSchema.findOne({
          contactNo: staff.contactNo,
        });
        if (existingContact) {
          duplicateContacts.push(staff.contactNo);
        }
      }

      // Check for duplicate names in existing database
      const existingStaff = await staffSchema.findOne({
        medicalRepName: staff.medicalRepName,
      });
      if (existingStaff) {
        duplicateNames.push(staff.medicalRepName);
      }
    }

    // If duplicates found, return error
    if (duplicateContacts.length > 0 || duplicateNames.length > 0) {
      let errorMessage = "Import failed due to duplicates: ";
      const errors = [];

      if (duplicateContacts.length > 0) {
        errors.push(
          `Contact numbers already registered: ${duplicateContacts.join(", ")}`
        );
      }
      if (duplicateNames.length > 0) {
        errors.push(`Staff names already exist: ${duplicateNames.join(", ")}`);
      }

      return res.status(409).json({
        message: errorMessage + errors.join("; "),
      });
    }

    // Import data
    const importPromises = staffList.map(async (staff) => {
      const staffData = {
        medicalRepName: staff.medicalRepName,
        teamName: staff.teamName,
        contactNo: staff.contactNo || "",
        email: staff.email || "",
        date: staff.date || new Date().toISOString(),
        enabled: staff.enabled !== undefined ? staff.enabled : true,
      };

      return staffSchema.create(staffData);
    });

    await Promise.all(importPromises);

    res.status(200).json({ message: "Staff imported successfully." });
  } catch (err) {
    // Handle duplicate key error
    if (err.code === 11000 && err.keyPattern && err.keyPattern.contactNo) {
      return res.status(409).json({
        message:
          "One or more contact numbers in the import file are already registered.",
      });
    }

    console.error("❌ Error importing staff:", err);
    handleServerError(res, err, "Error importing staff");
  }
});

export default router;
