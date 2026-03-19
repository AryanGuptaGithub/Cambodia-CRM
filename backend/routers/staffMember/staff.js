import express from "express";
import bcrypt from "bcryptjs";
import staffSchema from "../../models/staffMember/staff.js";
import User from "../../models/User.js";
import mongoose from "mongoose";

const router = express.Router();

// Helper function to normalize strings (remove extra spaces)
const normalizeString = (str) => {
  if (!str || typeof str !== "string") return "";
  // Replace multiple spaces with single space and trim
  return str.replace(/\s+/g, " ").trim();
};

// COMMON ERROR HANDLER
const sendError = (res, error, code = 400) => {
  console.error("❌ ERROR:", error);
  res.status(code).json({
    success: false,
    message: error.message || "Server error",
  });
};

// GET ALL STAFF
router.get("/", async (_, res) => {
  try {
    const staff = await staffSchema.find().sort({ updatedAt: -1 });
    res.json(staff);
  } catch (error) {
    sendError(res, error, 500);
  }
});

// GET TEAMS
router.get("/teams", async (_, res) => {
  try {
    const staff = await staffSchema.find({}, "teamName");
    const teams = [
      ...new Set(staff.map((i) => normalizeString(i.teamName)).filter(Boolean)),
    ];
    res.json(teams);
  } catch (error) {
    sendError(res, error, 500);
  }
});

// GET SINGLE STAFF
router.get("/:id", async (req, res) => {
  try {
    const staff = await staffSchema.findById(req.params.id);
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

// CREATE NEW STAFF
router.post("/", async (req, res) => {
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

    // Normalize all string inputs
    const name = normalizeString(medicalRepName);
    const team = normalizeString(teamName);
    const emailLower = email ? normalizeString(email).toLowerCase() : "";
    const contact = contactNo ? normalizeString(contactNo.toString()) : "";

    if (!name) {
      throw new Error("Staff name is required");
    }

    // Case-insensitive duplicate check for name
    const existingByName = await staffSchema
      .findOne({
        medicalRepNameLower: name.toLowerCase(),
      })
      .session(session);
    if (existingByName)
      throw new Error(
        `Staff name "${name}" already exists (case-insensitive).`,
      );

    if (emailLower) {
      const existingByEmail = await User.findOne({ email: emailLower }).session(
        session,
      );
      if (existingByEmail)
        throw new Error(`Email "${emailLower}" already exists.`);
    }

    if (contact) {
      const existingByContact = await staffSchema
        .findOne({ contactNo: contact })
        .session(session);
      if (existingByContact)
        throw new Error(`Contact "${contact}" already exists.`);
    }

    // Password hashing
    const finalPassword = password ? normalizeString(password) : "password123";
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

    // CREATE STAFF (no userId)
    const newStaff = await new staffSchema({
      medicalRepName: name,
      teamName: team,
      contactNo: contact,
      email: finalEmail,
      date: date ? new Date(date) : new Date(),
      isActive: isActive,
    }).save({ session });

    // CREATE USER with staffId reference (optional but kept for login)
    const newUser = await new User({
      name,
      email: finalEmail,
      password: hashedPassword,
      role: "user",
      isActive: true,
      staffId: newStaff._id, // user points to staff
    }).save({ session });

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: `Staff "${name}" created successfully.`,
      staff: newStaff,
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

// UPDATE STAFF
router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { medicalRepName, teamName, contactNo, email, date, isActive } =
      req.body;

    // Normalize inputs
    const normalizedName = normalizeString(medicalRepName);
    const normalizedTeam = normalizeString(teamName);
    const normalizedContact = contactNo
      ? normalizeString(contactNo.toString())
      : "";
    const normalizedEmail = email ? normalizeString(email).toLowerCase() : "";

    // Check for duplicate name (case-insensitive), excluding current record
    if (normalizedName) {
      const existingByName = await staffSchema
        .findOne({
          medicalRepNameLower: normalizedName.toLowerCase(),
          _id: { $ne: id },
        })
        .session(session);
      if (existingByName) {
        throw new Error(
          `Staff name "${normalizedName}" already exists (case-insensitive).`,
        );
      }
    }

    // Update staff
    const updateData = {
      medicalRepName: normalizedName,
      teamName: normalizedTeam,
      contactNo: normalizedContact,
      email: normalizedEmail,
      date,
    };
    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    const updatedStaff = await staffSchema.findByIdAndUpdate(id, updateData, {
      new: true,
      session,
    });

    // Optionally update the linked user's name and email (if user exists)
    if (normalizedEmail) {
      await User.findOneAndUpdate(
        { staffId: id },
        { email: normalizedEmail, name: normalizedName },
        { session },
      );
    } else if (normalizedName) {
      await User.findOneAndUpdate(
        { staffId: id },
        { name: normalizedName },
        { session },
      );
    }

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Staff updated successfully",
      data: updatedStaff,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error updating staff:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  } finally {
    session.endSession();
  }
});

// DELETE MULTIPLE STAFF
router.delete("/", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const ids = req.body;
    const staffList = await staffSchema
      .find({ _id: { $in: ids } })
      .session(session);
    // Delete staff
    await staffSchema.deleteMany({ _id: { $in: ids } }).session(session);
    // Delete linked users
    await User.deleteMany({ staffId: { $in: ids } }).session(session);
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

// DELETE SINGLE STAFF
router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const staff = await staffSchema.findById(req.params.id).session(session);
    if (!staff) throw new Error("Staff not found");
    await staffSchema.findByIdAndDelete(req.params.id).session(session);
    // Delete linked user if exists
    await User.deleteOne({ staffId: req.params.id }).session(session);
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

// IMPORT STAFF
router.post("/import", async (req, res) => {
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
    const seenNames = new Map();

    // First pass: Check for duplicates
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

      const name = normalizeString(medicalRepName);
      const nameLower = name.toLowerCase();
      const emailLower = email ? normalizeString(email).toLowerCase() : null;
      const contact = contactNo ? normalizeString(contactNo.toString()) : null;

      if (!name) {
        throw new Error(`medicalRepName is required in row ${i + 1}`);
      }

      if (seenNames.has(nameLower)) {
        if (!duplicateNames.includes(name)) duplicateNames.push(name);
      } else {
        seenNames.set(nameLower, name);
        const existingStaffByName = await staffSchema
          .findOne({ medicalRepNameLower: nameLower })
          .session(session);
        if (existingStaffByName && !duplicateNames.includes(name))
          duplicateNames.push(name);
      }

      if (emailLower) {
        const existingUser = await User.findOne({ email: emailLower }).session(
          session,
        );
        if (existingUser && !duplicateEmails.includes(emailLower))
          duplicateEmails.push(emailLower);
      }

      if (contact) {
        const existingStaffByContact = await staffSchema
          .findOne({ contactNo: contact })
          .session(session);
        if (existingStaffByContact && !duplicateContacts.includes(contact))
          duplicateContacts.push(contact);
      }
    }

    if (
      duplicateNames.length ||
      duplicateEmails.length ||
      duplicateContacts.length
    ) {
      return res.status(400).json({
        success: false,
        message: "Duplicate entries found",
        duplicates: {
          names: [...new Set(duplicateNames)],
          emails: [...new Set(duplicateEmails)],
          contacts: [...new Set(duplicateContacts)],
        },
      });
    }

    const importedStaff = [];
    const failedImports = [];

    // Second pass: Create records
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      try {
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

        const name = normalizeString(medicalRepName);
        const team = normalizeString(teamName);
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
        const emailLower = email ? normalizeString(email).toLowerCase() : "";
        const finalEmail =
          emailLower ||
          `${name.toLowerCase().replace(/\s+/g, ".")}@company.com`;
        const contact = contactNo ? normalizeString(contactNo.toString()) : "";

        let joinDate;
        try {
          if (date instanceof Date) {
            joinDate = date;
          } else if (typeof date === "string") {
            const parsed = new Date(date);
            if (isNaN(parsed.getTime())) {
              const excelNum = parseFloat(date);
              if (!isNaN(excelNum) && excelNum > 0) {
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

        // Create staff (no userId)
        const staff = new staffSchema({
          medicalRepName: name,
          teamName: team,
          contactNo: contact,
          email: finalEmail,
          date: joinDate,
          isActive: enabled,
        });
        await staff.save({ session });

        // Create user with staffId reference
        const newUser = new User({
          name,
          email: finalEmail,
          password: hashedPassword,
          role: "user",
          isActive: true,
          staffId: staff._id,
        });
        await newUser.save({ session });

        importedStaff.push({
          name,
          email: finalEmail,
          team,
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
      message: `Successfully imported ${importedStaff.length} staff members.${failedImports.length > 0 ? ` ${failedImports.length} failed.` : ""}`,
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

// UPDATE STAFF STATUS (staff-specific)
router.put("/status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const staff = await staffSchema.findById(id);
    if (!staff) {
      return res
        .status(404)
        .json({ success: false, message: "Staff not found" });
    }

    staff.isActive = isActive;
    await staff.save();

    res.json({
      success: true,
      message: `Staff status updated to ${isActive ? "enabled" : "disabled"}`,
      data: staff,
    });
  } catch (error) {
    console.error("Error updating staff status:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
