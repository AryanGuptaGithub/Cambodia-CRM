import express from "express";
import bcrypt from "bcryptjs";
import staffSchema from "../../models/staffMember/staff.js";
import User from "../../models/User.js";
import mongoose from "mongoose";

const router = express.Router();

// -----------------------------------------------------------
// COMMON ERROR HANDLER
// -----------------------------------------------------------
const sendError = (res, error, code = 400) => {
  console.error("❌ ERROR:", error);
  res.status(code).json({
    success: false,
    message: error.message || "Server error",
  });
};

// -----------------------------------------------------------
// GET ALL STAFF
// -----------------------------------------------------------
router.get("/staffs", async (_, res) => {
  try {
    const staff = await staffSchema
      .find()
      .populate("userId", "name email role isActive")
      .sort({ updatedAt: -1 });

    res.json(staff);
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.get("/staff/teams", async (_, res) => {
  try {
    const staff = await staffSchema.find({}, "teamName");
    const teams = [
      ...new Set(staff.map((i) => i.teamName?.trim()).filter(Boolean)),
    ];

    res.json(teams);
  } catch (error) {
    sendError(res, error, 500);
  }
});

// -----------------------------------------------------------
// GET SINGLE STAFF
// -----------------------------------------------------------
router.get("/staffs/:id", async (req, res) => {
  try {
    const staff = await staffSchema
      .findById(req.params.id)
      .populate("userId", "name email role isActive");

    if (!staff) {
      return res
        .status(404)
        .json({ success: false, message: "Staff not found" });
    }

    res.json(staff);
  } catch (error) {
    sendError(res, error, 500);
  }
});

// -----------------------------------------------------------
// CREATE NEW STAFF
// -----------------------------------------------------------
router.post("/staffs", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      medicalRepName,
      teamName,
      contactNo,
      email,
      password,
      date,
      enabled,
    } = req.body;

    const name = medicalRepName.trim();
    const emailLower = email?.trim().toLowerCase() || "";
    const contact = contactNo?.toString().trim() || "";

    // Duplicate Checks
    if (await staffSchema.findOne({ medicalRepName: name }).session(session))
      throw new Error(`Staff name "${name}" already exists.`);

    if (
      emailLower &&
      (await User.findOne({ email: emailLower }).session(session))
    )
      throw new Error(`Email "${emailLower}" already exists.`);

    if (
      contact &&
      (await staffSchema.findOne({ contactNo: contact }).session(session))
    )
      throw new Error(`Contact "${contact}" already exists.`);

    // Password hashing
    const finalPassword = password?.trim() || "password123";
    const hashedPassword = await bcrypt.hash(finalPassword, 10);

    // Email fallback
    let finalEmail = emailLower;
    if (!finalEmail) {
      const base = name.toLowerCase().replace(/\s+/g, ".");
      let candidate = `${base}@company.com`;
      let i = 1;

      while (await User.findOne({ email: candidate }).session(session)) {
        candidate = `${base}${i++}@company.com`;
      }

      finalEmail = candidate;
    }

    const isActive =
      enabled === true || enabled === "true" || enabled === "enabled";

    // CREATE USER
    const newUser = await new User({
      name,
      email: finalEmail,
      password: hashedPassword,
      role: "user",
      isActive,
    }).save({ session });

    // CREATE STAFF
    const newStaff = await new staffSchema({
      medicalRepName: name,
      teamName: teamName?.trim(),
      contactNo: contact,
      email: finalEmail,
      date: date ? new Date(date) : new Date(),
      userId: newUser._id,
    }).save({ session });

    newUser.staffId = newStaff._id;
    await newUser.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: `Staff "${name}" created successfully.`,
      staff: await staffSchema.findById(newStaff._id).populate("userId"),
      userAccount: {
        email: finalEmail,
        password: finalPassword,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    sendError(res, error);
  } finally {
    session.endSession();
  }
});

// -----------------------------------------------------------
// UPDATE STAFF
// -----------------------------------------------------------
router.put("/staff/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { medicalRepName, teamName, contactNo, email, date, isActive } = req.body;

    // Update staff
    const updatedStaff = await staffSchema.findByIdAndUpdate(
      id,
      {
        medicalRepName,
        teamName,
        contactNo,
        email,
        date,
      },
      { new: true }
    ).populate("userId", "name email isActive");

    // Update user's isActive status if changed
    if (updatedStaff.userId && isActive !== undefined) {
      await User.findByIdAndUpdate(
        updatedStaff.userId._id,
        { isActive },
        { new: true }
      );
    }

    // Re-populate to get updated user data
    const finalStaff = await staffSchema.findById(id).populate("userId");

    res.json({
      success: true,
      message: "Staff updated successfully",
      data: finalStaff
    });
  } catch (error) {
    console.error("Error updating staff:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
});

// -----------------------------------------------------------
// DELETE MULTIPLE STAFF
// -----------------------------------------------------------
router.delete("/staffs", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const ids = req.body;

    const staffList = await staffSchema
      .find({ _id: { $in: ids } })
      .session(session);
    const linkedUsers = staffList.map((s) => s.userId);

    await staffSchema.deleteMany({ _id: { $in: ids } }).session(session);
    await User.deleteMany({ _id: { $in: linkedUsers } }).session(session);

    await session.commitTransaction();

    res.json({
      success: true,
      message: `${ids.length} staff deleted.`,
    });
  } catch (error) {
    await session.abortTransaction();
    sendError(res, error);
  } finally {
    session.endSession();
  }
});

// -----------------------------------------------------------
// DELETE SINGLE STAFF
// -----------------------------------------------------------
router.delete("/staff/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const staff = await staffSchema.findById(req.params.id).session(session);
    if (!staff) throw new Error("Staff not found");

    await staffSchema.findByIdAndDelete(req.params.id).session(session);
    if (staff.userId)
      await User.findByIdAndDelete(staff.userId).session(session);

    await session.commitTransaction();

    res.json({
      success: true,
      message: `Staff "${staff.medicalRepName}" deleted.`,
    });
  } catch (error) {
    await session.abortTransaction();
    sendError(res, error);
  } finally {
    session.endSession();
  }
});

// -----------------------------------------------------------
// IMPORT STAFF - CORRECTED VERSION
// -----------------------------------------------------------
router.post("/staffs/import", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let list = req.body;

    if (req.body && req.body.data && Array.isArray(req.body.data)) {
      list = req.body.data;
    } else if (Array.isArray(req.body)) {
      list = req.body;
    } else if (req.body && Array.isArray(req.body.list)) {
      list = req.body.list;
    }

    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("Invalid import format: Expected non-empty array");
    }

    const duplicateEmails = [];
    const duplicateNames = [];
    const duplicateContacts = [];

    for (let i = 0; i < list.length; i++) {
      const row = list[i];

      const medicalRepName =
        row.medicalRepName || row.name || row["MR Name"] || row["mr name"];
      const email = row.email || row.Email || "";
      const contactNo =
        row.contactNo ||
        row.phone ||
        row["Contact No"] ||
        row["contact no"] ||
        row["Contact"] ||
        row["contact"];

      const name = medicalRepName?.trim();
      const emailLower = email?.trim().toLowerCase() || null;
      const contact = contactNo?.toString().trim() || null;

      if (!name) {
        throw new Error(`medicalRepName is required in row ${i + 1}`);
      }

      const existingStaffByName = await staffSchema
        .findOne({ medicalRepName: name })
        .session(session);
      if (existingStaffByName) {
        duplicateNames.push(name);
      }

      if (emailLower) {
        const existingUser = await User.findOne({ email: emailLower }).session(
          session
        );
        if (existingUser) {
          duplicateEmails.push(emailLower);
        }
      }

      // Check duplicate contact
      if (contact) {
        const existingStaffByContact = await staffSchema
          .findOne({ contactNo: contact })
          .session(session);
        if (existingStaffByContact) {
          duplicateContacts.push(contact);
        }
      }
    }

    // If any duplicates found → abort
    if (
      duplicateNames.length ||
      duplicateEmails.length ||
      duplicateContacts.length
    ) {
      return res.status(400).json({
        success: false,
        message: "Duplicate entries found",
        duplicates: {
          names: duplicateNames,
          emails: duplicateEmails,
          contacts: duplicateContacts,
        },
      });
    }

    const importedStaff = [];
    const failedImports = [];

    // Second Pass: Create Users + Staff
    for (let i = 0; i < list.length; i++) {
      const row = list[i];

      try {
        // Extract data with fallback for different property names
        const medicalRepName =
          row.medicalRepName || row.name || row["MR Name"] || row["mr name"];
        const teamName =
          row.teamName || row["Team Name"] || row["team name"] || row.team;
        const email = row.email || row.Email || "";
        const contactNo =
          row.contactNo ||
          row.phone ||
          row["Contact No"] ||
          row["contact no"] ||
          row["Contact"] ||
          row["contact"];
        const password = row.password || row.Password || "123456";
        const date =
          row.date ||
          row.Date ||
          row["Joining Date"] ||
          row["joining date"] ||
          row["Instance of Joining Date"] ||
          new Date();
        const enabled = row.enabled !== undefined ? row.enabled : true;

        const name = medicalRepName.trim();
        const team = teamName?.trim();

        if (!team) {
          failedImports.push({
            row: i + 1,
            name,
            error: "Team name is required",
          });
          continue;
        }

        const plaintextPassword = password;

        const hashedPassword = await bcrypt.hash(plaintextPassword, 10);

        const emailLower = email?.trim().toLowerCase() || "";
        const finalEmail =
          emailLower ||
          `${name.toLowerCase().replace(/\s+/g, ".")}@company.com`;

        const contact = contactNo?.toString().trim() || "";

        // Parse date
        let joinDate;
        try {
          if (date instanceof Date) {
            joinDate = date;
          } else if (typeof date === "string") {
            // Try parsing the date string
            const parsed = new Date(date);
            if (isNaN(parsed.getTime())) {
              // Try Excel serial number
              const excelNum = parseFloat(date);
              if (!isNaN(excelNum) && excelNum > 0) {
                // Excel date (days since 1900-01-01)
                const excelDate = new Date((excelNum - 25569) * 86400 * 1000);
                if (!isNaN(excelDate.getTime())) {
                  joinDate = excelDate;
                }
              }
            } else {
              joinDate = parsed;
            }
          }
        } catch (dateError) {
          console.log(`Date parsing error for ${name}:`, dateError);
        }

        if (!joinDate || isNaN(joinDate.getTime())) {
          joinDate = new Date();
        }

        // Create User
        const newUser = new User({
          name,
          email: finalEmail,
          password: hashedPassword,
          role: "user",
          isActive: enabled,
        });
        await newUser.save({ session });
        

        // Create Staff
        const staff = new staffSchema({
          medicalRepName: name,
          teamName: team,
          contactNo: contact,
          email: finalEmail,
          date: joinDate,
          userId: newUser._id,
        });
        await staff.save({ session });
        

        // Link back
        newUser.staffId = staff._id;
        await newUser.save({ session });
        

        importedStaff.push({
          name,
          email: finalEmail,
          team,
          userId: newUser._id,
          staffId: staff._id,
        });
      } catch (rowError) {
        console.error(`Error processing row ${i + 1}:`, rowError);
        failedImports.push({
          row: i + 1,
          name: row.medicalRepName || row.name || `Row ${i + 1}`,
          error: rowError.message,
        });
      }
    }

    await session.commitTransaction();

    res.json({
      success: true,
      message: `Successfully imported ${importedStaff.length} staff members.${
        failedImports.length > 0 ? ` ${failedImports.length} failed.` : ""
      }`,
      count: importedStaff.length,
      imported: importedStaff,
      failed: failedImports.length > 0 ? failedImports : undefined,
    });
  } catch (error) {
    await session.abortTransaction();
    sendError(res, error);
  } finally {
    session.endSession();
  }
});


// Add this route in your backend
router.put("/staff/status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    // Find staff
    const staff = await staffSchema.findById(id);
    if (!staff) {
      return res.status(404).json({ 
        success: false, 
        message: "Staff not found" 
      });
    }

    // Update user's isActive status
    if (staff.userId) {
      await User.findByIdAndUpdate(
        staff.userId, 
        { isActive },
        { new: true }
      );
    }

    res.json({
      success: true,
      message: `Staff status updated to ${isActive ? "active" : "inactive"}`,
      data: { isActive }
    });
  } catch (error) {
    console.error("Error updating staff status:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
});
export default router;
