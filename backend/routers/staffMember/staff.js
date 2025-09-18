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
    console.log("values of staff", staff);
    const teams = [
      ...new Set(staff.map((s) => s.teamName?.trim()).filter(Boolean))
    ];

    console.log('values of teams', teams);
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

// ✅ Route: Create supplier
router.post("/staffs", async (req, res) => {
  try {
    const payload = {
      ...req.body,
      openingBalance: Number(req.body.openingBalance) || 0,
      creditPeriod: Number(req.body.creditPeriod) || 0,
      creditLimit: Number(req.body.creditLimit) || 0,
    };

    const newStaff = new staffSchema(payload);
    const savedStaff = await newStaff.save();

    res.status(201).json({
      message: `Supplier <b>${savedStaff.name}</b> created successfully`,
      ok: true,
    });
  } catch (err) {
    if (err.code === 11000) return handleDuplicateError(res, err, "supplier");
    res.status(400).json({
      message: "Invalid data provided",
      error: err.message,
      ok: false,
    });
  }
});

// ✅ Route: Update supplier
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

// ✅ Route: Delete one supplier
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
      message: `Staff <b>${deleted.name}</b> deleted successfully`,
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

    const requiredFields = ["mrName", "teamName"];

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
        medicalRepName: staff.mrName,
        teamName: staff.teamName,
      };

      const existingSupplier = await staffSchema.findOne({
        medicalRepName: staffData.medicalRepName,
        name: staffData.name,
      });

      if (!existingSupplier) {
        await staffSchema.create(staffData);
      }
    }

    res.status(200).json({ message: "Staff imported successfully." });
  } catch (err) {
    console.log("values of err", err);
  }
});

export default router;
