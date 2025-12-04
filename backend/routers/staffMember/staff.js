import express from "express";
import bcrypt from "bcryptjs";
import staffSchema from "../../models/staffMember/staff.js";
import User from "../../models/User.js";
import mongoose from "mongoose";

const router = express.Router();

// Helper
const handleServerError = (res, err, message = "Server error", code = 500) => {
  console.error("❌ [ERROR]:", err);
  res.status(code).json({ message, error: err.message || err });
};

// Username generator
const generateUsername = async (name, session) => {
  const base = name.toLowerCase().replace(/\s+/g, "");
  let username = base;
  let count = 1;
  while (await User.findOne({ username }).session(session)) {
    username = `${base}${count++}`;
  }
  return username;
};

// --------------------------------------------------
// GET ALL STAFFS
// --------------------------------------------------
router.get("/staffs", async (_, res) => {
  try {
    const staff = await staffSchema
      .find()
      .populate("userId", "name email username role isActive")
      .sort({ updatedAt: -1, createdAt: -1 });
    res.json(staff);
  } catch (err) {
    handleServerError(res, err);
  }
});

// --------------------------------------------------
// GET TEAMS
// --------------------------------------------------
router.get("/staff/teams", async (_, res) => {
  try {
    const staff = await staffSchema.find({}, "teamName");
    const teams = [...new Set(staff.map(s => s.teamName?.trim()).filter(Boolean))];
    res.json(teams);
  } catch (err) {
    handleServerError(res, err);
  }
});

// --------------------------------------------------
// GET SINGLE STAFF
// --------------------------------------------------
router.get("/staffs/:id", async (req, res) => {
  try {
    const staff = await staffSchema
      .findById(req.params.id)
      .populate("userId", "name email username role isActive");

    if (!staff) return res.status(404).json({ message: "Staff not found" });

    res.json(staff);
  } catch (err) {
    handleServerError(res, err);
  }
});

// --------------------------------------------------
// CREATE STAFF
// --------------------------------------------------
router.post("/staffs", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { medicalRepName, teamName, contactNo, email, password, date, enabled } = req.body;

    const trimmedName = medicalRepName.trim();
    const trimmedEmail = email?.trim().toLowerCase() || "";
    const trimmedContact = contactNo?.trim() || "";

    // Duplicate name check
    if (await staffSchema.findOne({ medicalRepName: trimmedName }).session(session)) {
      throw new Error(`Staff member "${trimmedName}" already exists.`);
    }

    // Duplicate email check (User)
    if (trimmedEmail) {
      if (await User.findOne({ email: trimmedEmail }).session(session)) {
        throw new Error(`Email "${trimmedEmail}" already registered.`);
      }
    }

    // Duplicate contact check
    if (trimmedContact) {
      if (await staffSchema.findOne({ contactNo: trimmedContact }).session(session)) {
        throw new Error(`Contact "${trimmedContact}" already registered.`);
      }
    }

    // Password
    const finalPassword = password?.trim() || "password123";
    const hashedPassword = await bcrypt.hash(finalPassword, 10);

    // Username
    const username = await generateUsername(trimmedName, session);

    // Email fallback
    let finalEmail = trimmedEmail;
    if (!finalEmail) {
      finalEmail = `${trimmedName.toLowerCase().replace(/\s+/g, ".")}@company.com`;
      let temp = finalEmail;
      let i = 1;
      while (await User.findOne({ email: temp }).session(session)) {
        temp = `${trimmedName.toLowerCase().replace(/\s+/g, ".")}${i++}@company.com`;
      }
      finalEmail = temp;
    }

    const isActive = enabled === "true" || enabled === true || enabled === "enabled";

    // Create user
    const newUser = await new User({
      name: trimmedName,
      email: finalEmail,
      username,
      password: hashedPassword,
      role: "Medical Representative",
      isActive
    }).save({ session });

    // Create staff (NO enabled)
    const newStaff = await new staffSchema({
      medicalRepName: trimmedName,
      teamName: teamName.trim(),
      contactNo: trimmedContact,
      email: trimmedEmail || finalEmail,
      date: new Date(date),
      userId: newUser._id
    }).save({ session });

    newUser.staffId = newStaff._id;
    await newUser.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: `Staff "<b>${trimmedName}</b>" created successfully.`,
      ok: true,
      staff: await staffSchema.findById(newStaff._id).populate("userId", "name email username role isActive"),
      userAccount: {
        email: newUser.email,
        username: newUser.username,
        password: finalPassword
      }
    });

  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    handleServerError(res, err, err.message, 400);
  }
});

// --------------------------------------------------
// UPDATE STAFF
// --------------------------------------------------
router.put("/staff/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { contactNo, medicalRepName, email } = req.body;

    const existing = await staffSchema.findById(req.params.id).session(session);
    if (!existing) throw new Error("Staff not found");

    // Duplicate contact
    if (contactNo && contactNo !== existing.contactNo) {
      if (await staffSchema.findOne({ contactNo, _id: { $ne: existing._id } }).session(session)) {
        throw new Error(`Contact number "${contactNo}" already used.`);
      }
    }

    // Duplicate name
    if (medicalRepName && medicalRepName !== existing.medicalRepName) {
      if (await staffSchema.findOne({ medicalRepName, _id: { $ne: existing._id } }).session(session)) {
        throw new Error(`Staff name "${medicalRepName}" already exists.`);
      }
    }

    // Duplicate email check (User)
    if (email && email !== existing.email) {
      if (await User.findOne({ email: email.toLowerCase(), _id: { $ne: existing.userId } }).session(session)) {
        throw new Error(`Email "${email}" already exists.`);
      }
    }

    // Update staff
    const updatedStaff = await staffSchema.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true, session }
    ).populate("userId", "name email username role isActive");

    // Update user
    if (existing.userId) {
      const updateUser = {};

      if (email && email !== existing.email) {
        updateUser.email = email.toLowerCase();
        updateUser.username = email.toLowerCase();
      }

      if (medicalRepName && medicalRepName !== existing.medicalRepName) {
        updateUser.name = medicalRepName;
      }

      if (req.body.enabled !== undefined) {
        updateUser.isActive =
          req.body.enabled === true ||
          req.body.enabled === "true" ||
          req.body.enabled === "enabled";
      }

      if (Object.keys(updateUser).length > 0) {
        await User.findByIdAndUpdate(existing.userId, updateUser, { session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.json(updatedStaff);

  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    handleServerError(res, err, err.message, 400);
  }
});

// --------------------------------------------------
// DELETE MULTIPLE STAFF
// --------------------------------------------------
router.delete("/staffs", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const ids = req.body;
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("No staff IDs provided");

    const staffList = await staffSchema.find({ _id: { $in: ids } }).session(session);

    const userIds = staffList.map(s => s.userId).filter(Boolean);

    await staffSchema.deleteMany({ _id: { $in: ids } }).session(session);
    await User.deleteMany({ _id: { $in: userIds } }).session(session);

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: `${ids.length} staff(s) and user accounts deleted.`
    });

  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    handleServerError(res, err);
  }
});

// --------------------------------------------------
// DELETE SINGLE STAFF
// --------------------------------------------------
router.delete("/staff/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const staff = await staffSchema.findById(req.params.id).session(session);
    if (!staff) throw new Error("Staff not found");

    await staffSchema.findByIdAndDelete(req.params.id).session(session);

    if (staff.userId) {
      await User.findByIdAndDelete(staff.userId).session(session);
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: `Staff <b>${staff.medicalRepName}</b> deleted.`,
      ok: true
    });

  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    handleServerError(res, err);
  }
});

// --------------------------------------------------
// IMPORT STAFF
// --------------------------------------------------
router.post("/staffs/import", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const list = req.body;
    if (!Array.isArray(list)) throw new Error("Invalid data format");

    const duplicateContacts = [];
    const duplicateNames = [];
    const duplicateEmails = [];

    // First pass: detect duplicates
    for (const row of list) {
      const name = row.medicalRepName.trim();
      const email = row.email?.trim().toLowerCase();

      if (await staffSchema.findOne({ medicalRepName: name }).session(session))
        duplicateNames.push(name);

      if (row.contactNo) {
        if (await staffSchema.findOne({ contactNo: row.contactNo }).session(session))
          duplicateContacts.push(row.contactNo);
      }

      if (email) {
        if (await User.findOne({ email }).session(session))
          duplicateEmails.push(email);
      }
    }

    if (duplicateContacts.length || duplicateNames.length || duplicateEmails.length) {
      throw new Error(
        `Duplicates found: Contacts: [${duplicateContacts}], Names: [${duplicateNames}], Emails: [${duplicateEmails}]`
      );
    }

    // Import
    for (const row of list) {
      const trimmedName = row.medicalRepName.trim();
      const trimmedEmail = row.email?.trim().toLowerCase() || "";
      const trimmedContact = row.contactNo.toString()?.trim() || "";

      const hashedPassword = await bcrypt.hash(
        row.password || "password123",
        10
      );

      const username = await generateUsername(trimmedName, session);

      const userEmail =
        trimmedEmail ||
        `${trimmedName.toLowerCase().replace(/\s+/g, ".")}@company.com`;

      const user = await new User({
        name: trimmedName,
        email: userEmail,
        username,
        password: hashedPassword,
        role: row.role || "Medical Representative",
        isActive: row.enabled !== undefined ? row.enabled : true
      }).save({ session });

      const staff = await new staffSchema({
        medicalRepName: trimmedName,
        teamName: row.teamName.trim(),
        contactNo: trimmedContact,
        email: trimmedEmail,
        date: row.date || new Date(),
        userId: user._id
      }).save({ session });

      user.staffId = staff._id;
      await user.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    res.json({ message: "Staff imported successfully." });

  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    handleServerError(res, err, err.message, 400);
  }
});

export default router;
