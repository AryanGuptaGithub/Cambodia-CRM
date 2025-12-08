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

// -----------------------------------------------------------
// GET UNIQUE TEAMS
// -----------------------------------------------------------
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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, medicalRepName, contactNo } = req.body;

    const staff = await staffSchema.findById(req.params.id).session(session);
    if (!staff) throw new Error("Staff not found");

    // Duplicate Checks
    if (contactNo && contactNo !== staff.contactNo) {
      if (
        await staffSchema
          .findOne({ contactNo, _id: { $ne: staff._id } })
          .session(session)
      )
        throw new Error(`Contact number already exists`);
    }

    if (medicalRepName && medicalRepName.trim() !== staff.medicalRepName) {
      if (
        await staffSchema
          .findOne({ medicalRepName, _id: { $ne: staff._id } })
          .session(session)
      )
        throw new Error(`Name already exists`);
    }

    if (email && email.toLowerCase() !== staff.email) {
      if (
        await User.findOne({
          email: email.toLowerCase(),
          _id: { $ne: staff.userId },
        }).session(session)
      )
        throw new Error(`Email already exists`);
    }

    // Update staff
    const updatedStaff = await staffSchema.findByIdAndUpdate(
      staff._id,
      req.body,
      { new: true, session }
    );

    // Update user
    if (staff.userId) {
      const updateUser = {};

      if (email) updateUser.email = email.toLowerCase();
      if (medicalRepName) updateUser.name = medicalRepName;

      if (req.body.enabled !== undefined) {
        updateUser.isActive =
          req.body.enabled === true ||
          req.body.enabled === "true" ||
          req.body.enabled === "enabled";
      }

      if (Object.keys(updateUser).length > 0) {
        await User.findByIdAndUpdate(staff.userId, updateUser, { session });
      }
    }

    await session.commitTransaction();

    res.json({
      success: true,
      updated: updatedStaff,
    });
  } catch (error) {
    await session.abortTransaction();
    sendError(res, error);
  } finally {
    session.endSession();
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
// IMPORT STAFF
// -----------------------------------------------------------
router.post("/staffs/import", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const list = req.body;

    if (!Array.isArray(list)) {
      throw new Error("Invalid import format");
    }

    const duplicateEmails = [];
    const duplicateNames = [];
    const duplicateContacts = [];

    // Check duplicates
    for (const row of list) {
      const name = row.medicalRepName?.trim();
      const email = row.email?.trim().toLowerCase() || null;
      const contact = row.contactNo?.toString() || null;

      if (!name) throw new Error("medicalRepName is required in import row");

      if (await staffSchema.findOne({ medicalRepName: name }).session(session))
        duplicateNames.push(name);

      if (email && (await User.findOne({ email }).session(session)))
        duplicateEmails.push(email);

      if (contact && (await staffSchema.findOne({ contactNo: contact }).session(session)))
        duplicateContacts.push(contact);
    }

    if (duplicateNames.length || duplicateEmails.length || duplicateContacts.length) {
      throw new Error("Duplicate entries found. Import aborted.");
    }

    for (const row of list) {
      const name = row.medicalRepName.trim();
      const emailLower = row.email?.trim().toLowerCase() || "";
      const contact = row.contactNo?.toString().trim() || "";

      // Password hash
      const plaintextPassword = row.password || "password123";
      const hashedPassword = await bcrypt.hash(plaintextPassword, 10);
    
      // Final email
      const finalEmail =
        emailLower || `${name.toLowerCase().replace(/\s+/g, ".")}@company.com`;
      
      // Create user
      const newUser = await new User({
        name,
        email: finalEmail,
        password: hashedPassword,
        role: "user",
        isActive: row.enabled ?? true,
      }).save({ session });

      // Create staff
      const staff = await new staffSchema({
        medicalRepName: name,
        teamName: row.teamName,
        contactNo: contact,
        email: finalEmail,
        date: row.date || new Date(),
        userId: newUser._id,
      }).save({ session });

      // Link staff to user
      newUser.staffId = staff._id;
      await newUser.save({ session });
    }

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Staff imported successfully.",
    });
  } catch (error) {
    await session.abortTransaction();
    sendError(res, error);
  } finally {
    session.endSession();
  }
});

export default router;
