import express from "express";
import bcrypt from "bcryptjs";
import Staff from "../../models/staffMember/staff.js";
import mongoose from "mongoose";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";

const router = express.Router();

// Helper: normalize strings
const normalizeString = (str) => {
  if (!str || typeof str !== "string") return "";
  return str.replace(/\s+/g, " ").trim();
};

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Error handler
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
    const staff = await Staff.find().sort({ updatedAt: -1 });
    res.json(staff);
  } catch (error) {
    sendError(res, error, 500);
  }
});

// GET TEAMS
router.get("/teams", async (_, res) => {
  try {
    const staff = await Staff.find({}, "teamName");
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
    const staff = await Staff.findById(req.params.id);
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

// CREATE NEW STAFF with activity logging
router.post("/", protect, allowAdminOnly, async (req, res) => {
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

    const name = normalizeString(medicalRepName);
    const team = normalizeString(teamName);
    const contact = contactNo ? normalizeString(contactNo.toString()) : "";
    const emailLower = email ? normalizeString(email).toLowerCase() : "";
    const plainPassword =
      password && password.trim() ? password.trim() : "password123";

    if (!name) throw new Error("Staff name is required");

    // Case‑insensitive duplicate check for name
    const existingByName = await Staff.findOne({
      medicalRepNameLower: name.toLowerCase(),
    }).session(session);
    if (existingByName)
      throw new Error(
        `Staff name "${name}" already exists (case‑insensitive).`,
      );

    // Duplicate email check
    if (emailLower) {
      const existingByEmail = await Staff.findOne({
        email: emailLower,
      }).session(session);
      if (existingByEmail)
        throw new Error(`Email "${emailLower}" already exists.`);
    }

    // Duplicate contact check
    if (contact) {
      const existingByContact = await Staff.findOne({
        contactNo: contact,
      }).session(session);
      if (existingByContact)
        throw new Error(`Contact "${contact}" already exists.`);
    }

    // Prepare date
    let joinDate;
    if (date) {
      joinDate = new Date(date);
      if (isNaN(joinDate.getTime())) joinDate = new Date();
    } else {
      joinDate = new Date();
    }

    const isActive =
      enabled === true || enabled === "true" || enabled === "enabled";

    // Create staff (password will be hashed by the pre‑save hook)
    const newStaff = new Staff({
      medicalRepName: name,
      teamName: team,
      contactNo: contact,
      email: emailLower,
      password: plainPassword,
      date: joinDate,
      isActive,
    });

    await newStaff.save({ session });
    await session.commitTransaction();

    // Log activity
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Staff: ${toTitleCase(newStaff.medicalRepName)}`,
      tableName: "staff",
      tableLabel: "Staff Member",
      recordId: newStaff._id,
      referenceNumber: newStaff.medicalRepName,
      newData: newStaff.toObject(),
      description: `New staff member "${toTitleCase(newStaff.medicalRepName)}" added to team "${newStaff.teamName}"`,
      refField: "medicalRepName",
    });

    res.status(201).json({
      success: true,
      message: `Staff "${name}" created successfully.`,
      staff: newStaff,
    });
  } catch (error) {
    await session.abortTransaction();
    sendError(res, error);
  } finally {
    session.endSession();
  }
});

// UPDATE STAFF with activity logging
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const {
      medicalRepName,
      teamName,
      contactNo,
      email,
      date,
      isActive,
      password,
    } = req.body;

    // Get previous record for logging
    const previousRecord = await Staff.findById(id).lean();
    if (!previousRecord) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Staff not found",
      });
    }

    // Normalize inputs
    const normalizedName = normalizeString(medicalRepName);
    const normalizedTeam = normalizeString(teamName);
    const normalizedContact = contactNo
      ? normalizeString(contactNo.toString())
      : "";
    const normalizedEmail = email ? normalizeString(email).toLowerCase() : "";

    // Check for duplicate name (excluding current staff)
    if (normalizedName) {
      const existingByName = await Staff.findOne({
        medicalRepNameLower: normalizedName.toLowerCase(),
        _id: { $ne: id },
      }).session(session);
      if (existingByName) {
        throw new Error(
          `Staff name "${normalizedName}" already exists (case‑insensitive).`,
        );
      }
    }

    // Check for duplicate email (excluding current staff)
    if (normalizedEmail) {
      const existingByEmail = await Staff.findOne({
        email: normalizedEmail,
        _id: { $ne: id },
      }).session(session);
      if (existingByEmail) {
        throw new Error(`Email "${normalizedEmail}" already exists.`);
      }
    }

    // Check for duplicate contact (excluding current staff)
    if (normalizedContact) {
      const existingByContact = await Staff.findOne({
        contactNo: normalizedContact,
        _id: { $ne: id },
      }).session(session);
      if (existingByContact) {
        throw new Error(`Contact "${normalizedContact}" already exists.`);
      }
    }

    // Build update object
    const updateData = {};
    if (normalizedName) updateData.medicalRepName = normalizedName;
    if (normalizedTeam) updateData.teamName = normalizedTeam;
    if (normalizedContact) updateData.contactNo = normalizedContact;
    if (normalizedEmail) updateData.email = normalizedEmail;
    if (date) updateData.date = new Date(date);
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) updateData.password = password; // will be hashed by pre‑save

    const updatedStaff = await Staff.findByIdAndUpdate(id, updateData, {
      new: true,
      session,
      runValidators: true,
    });

    if (!updatedStaff) throw new Error("Staff not found");

    await session.commitTransaction();

    // Log activity
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Staff: ${toTitleCase(updatedStaff.medicalRepName)}`,
      tableName: "staff",
      tableLabel: "Staff Member",
      recordId: updatedStaff._id,
      referenceNumber: updatedStaff.medicalRepName,
      previousData: previousRecord,
      newData: updatedStaff.toObject(),
      description: `Staff member "${toTitleCase(updatedStaff.medicalRepName)}" was updated`,
      refField: "medicalRepName",
    });

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

// DELETE SINGLE STAFF with activity logging
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;

    // Get full record before deletion for logging
    const staff = await Staff.findById(id).session(session);
    if (!staff) throw new Error("Staff not found");

    const deletedStaff = await Staff.findByIdAndDelete(id).session(session);

    await session.commitTransaction();

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Staff: ${toTitleCase(staff.medicalRepName)}`,
      tableName: "staff",
      tableLabel: "Staff Member",
      recordId: staff._id,
      referenceNumber: staff.medicalRepName,
      previousData: staff.toObject(),
      description: `Staff member "${toTitleCase(staff.medicalRepName)}" from team "${staff.teamName}" permanently deleted`,
      refField: "medicalRepName",
    });

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

// DELETE MULTIPLE STAFF (Bulk delete) with activity logging
router.delete("/", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No IDs provided",
      });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid staff IDs provided",
      });
    }

    // Get full records before deletion for logging
    const toDelete = await Staff.find({ _id: { $in: validIds } }).session(
      session,
    );
    const result = await Staff.deleteMany({ _id: { $in: validIds } }).session(
      session,
    );

    await session.commitTransaction();

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Staff Member(s)`,
      tableName: "staff",
      tableLabel: "Staff Member",
      previousData: toDelete.map((staff) => staff.toObject()),
      description: `Deleted ${result.deletedCount} staff members: ${toDelete.map((s) => s.medicalRepName).join(", ")}`,
      refField: "medicalRepName",
    });

    res.json({
      success: true,
      message: `${result.deletedCount} staff deleted.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    await session.abortTransaction();
    sendError(res, error);
  } finally {
    session.endSession();
  }
});

// IMPORT STAFF with activity logging
router.post("/import", protect, allowAdminOnly, async (req, res) => {
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
      throw new Error("Invalid import format: Expected non‑empty array");
    }

    const duplicateEmails = [];
    const duplicateNames = [];
    const duplicateContacts = [];
    const seenNames = new Map();

    // First pass: check for duplicates
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

      if (!name) throw new Error(`medicalRepName is required in row ${i + 1}`);

      if (seenNames.has(nameLower)) {
        if (!duplicateNames.includes(name)) duplicateNames.push(name);
      } else {
        seenNames.set(nameLower, name);
        const existingStaffByName = await Staff.findOne({
          medicalRepNameLower: nameLower,
        }).session(session);
        if (existingStaffByName && !duplicateNames.includes(name))
          duplicateNames.push(name);
      }

      if (emailLower) {
        const existingStaffByEmail = await Staff.findOne({
          email: emailLower,
        }).session(session);
        if (existingStaffByEmail && !duplicateEmails.includes(emailLower))
          duplicateEmails.push(emailLower);
      }

      if (contact) {
        const existingStaffByContact = await Staff.findOne({
          contactNo: contact,
        }).session(session);
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

    // Second pass: create records
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

        const plainPassword = password ? normalizeString(password) : "123456";
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
                if (!isNaN(excelDate.getTime())) joinDate = excelDate;
              }
            } else {
              joinDate = parsed;
            }
          }
        } catch (dateError) {
          console.log(`Date parsing error for ${name}:`, dateError);
        }
        if (!joinDate || isNaN(joinDate.getTime())) joinDate = new Date();

        const staff = new Staff({
          medicalRepName: name,
          teamName: team,
          contactNo: contact,
          email: finalEmail,
          password: plainPassword,
          date: joinDate,
          isActive: enabled,
        });

        await staff.save({ session });
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

    // Log activity if any staff were imported
    if (importedStaff.length > 0) {
      await logActivity(req, {
        action: "IMPORT",
        actionLabel: `Bulk Imported ${importedStaff.length} Staff Member(s)`,
        tableName: "staff",
        tableLabel: "Staff Member",
        description: `Imported ${importedStaff.length} staff members. Failed: ${failedImports.length}.`,
        newData: {
          importedCount: importedStaff.length,
          failedCount: failedImports.length,
          importedList: importedStaff.map((s) => s.name),
        },
      });
    }

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

// UPDATE STAFF STATUS with activity logging
router.put("/status/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const previousRecord = await Staff.findById(id).lean();
    if (!previousRecord) {
      return res
        .status(404)
        .json({ success: false, message: "Staff not found" });
    }

    const staff = await Staff.findById(id);
    staff.isActive = isActive;
    await staff.save();

    // Log activity
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `${isActive ? "Enabled" : "Disabled"} Staff: ${toTitleCase(staff.medicalRepName)}`,
      tableName: "staff",
      tableLabel: "Staff Member",
      recordId: staff._id,
      referenceNumber: staff.medicalRepName,
      previousData: { isActive: previousRecord.isActive },
      newData: { isActive: staff.isActive },
      description: `Staff member "${toTitleCase(staff.medicalRepName)}" was ${isActive ? "enabled" : "disabled"}`,
      refField: "medicalRepName",
    });

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

// EXPORT STAFF with activity logging
router.get("/export", protect, allowAdminOnly, async (req, res) => {
  try {
    const staff = await Staff.find({}).lean();

    const data = staff.map((member) => ({
      Name: member.medicalRepName,
      Team: member.teamName,
      "Contact No": member.contactNo || "",
      Email: member.email || "",
      "Joining Date": member.date
        ? new Date(member.date).toISOString().split("T")[0]
        : "",
      Status: member.isActive ? "Active" : "Inactive",
    }));

    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Staff");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    await logActivity(req, {
      action: "EXPORT",
      actionLabel: `Exported Staff List (${staff.length} records)`,
      tableName: "staff",
      tableLabel: "Staff Member",
      description: `Exported ${staff.length} staff members to Excel`,
      newData: { count: staff.length },
    });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=staff_list.xlsx",
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export staff",
    });
  }
});

export default router;
