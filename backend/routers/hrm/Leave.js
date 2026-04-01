import express from "express";
import mongoose from "mongoose";
import Attendance from "../../models/Hrm/Attendance.js";
import Leave from "../../models/Hrm/Leaves.js";
import Holiday from "../../models/Hrm/Holidays.js";

const router = express.Router();

// Helper: format minutes → "HH:MM:SS"
const formatMinutesToTimeString = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:00`;
};

// Get the exact UTC day range for a given date.
const getDayRange = (dateInput) => {
  let year, month, day;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    [year, month, day] = dateInput.split("-").map(Number);
    month -= 1;
  } else {
    const d = new Date(dateInput);
    year = d.getUTCFullYear();
    month = d.getUTCMonth();
    day = d.getUTCDate();
  }

  const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
  return { start, end };
};

// Check if a date is Sunday or holiday
const isHolidayOrSunday = async (date) => {
  const checkDate = new Date(date);

  if (checkDate.getDay() === 0) {
    return { isHoliday: true, reason: "Sunday" };
  }

  const startOfDay = new Date(checkDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(checkDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const holiday = await Holiday.findOne({
    $or: [
      { date: { $gte: startOfDay, $lte: endOfDay } },
      { startDate: { $gte: startOfDay, $lte: endOfDay } },
    ],
  });

  if (holiday) {
    return { isHoliday: true, reason: holiday.name };
  }
  return { isHoliday: false, reason: null };
};

// Helper: enforce extra hours consistency – delete swap leaves that exceed available extra hours
const enforceExtraHoursConsistency = async (userId, session = null) => {
  try {
    const attendanceRecords = await Attendance.find({
      userId,
      isLeaveDay: { $ne: true },
    }).session(session);

    const totalExtraMinutes = attendanceRecords.reduce(
      (sum, rec) => sum + (rec.extraHoursInMinutes || 0),
      0,
    );

    const swapLeaves = await Leave.find({
      userId,
      leaveType: "swapleave",
      status: "approved",
    })
      .sort({ leaveDate: 1 })
      .session(session);

    const maxAllowedLeaves = Math.floor(totalExtraMinutes / 480);
    if (swapLeaves.length > maxAllowedLeaves) {
      const excess = swapLeaves.length - maxAllowedLeaves;
      const toDelete = swapLeaves.slice(-excess);
      await Leave.deleteMany({
        _id: { $in: toDelete.map((l) => l._id) },
      }).session(session);
    }
  } catch (err) {
    console.error("Error enforcing extra hours consistency:", err);
  }
};

// Helper functions for extra hours calculations
const calculateExtraHoursSummary = async (userId) => {
  try {
    const attendanceRecords = await Attendance.find({
      userId,
      logoutTime: { $exists: true },
      isLeaveDay: { $ne: true },
    }).sort({ loginTime: -1 });

    let totalExtraMinutes = 0;
    let totalWorkedMinutes = 0;
    const recordsWithExtraHours = [];

    attendanceRecords.forEach((record) => {
      if (record.loginTime && record.logoutTime) {
        const diffMs = new Date(record.logoutTime) - new Date(record.loginTime);
        const minutesWorked = Math.floor(diffMs / (1000 * 60));
        totalWorkedMinutes += minutesWorked;

        if (record.extraHoursInMinutes > 0 && !record.isLeaveDay) {
          totalExtraMinutes += record.extraHoursInMinutes;
          recordsWithExtraHours.push({
            id: record._id,
            date: record.loginTime,
            extraHours: record.extraHours,
            extraHoursInMinutes: record.extraHoursInMinutes,
            totalTime: record.totalTime,
            workedHours: minutesWorked / 60,
          });
        }
      }
    });

    const totalExtraHours = totalExtraMinutes / 60;
    const leaveDaysAvailable = Math.floor(totalExtraMinutes / 480);
    const remainingMinutes = totalExtraMinutes % 480;

    return {
      userId,
      totalExtraHours: parseFloat(totalExtraHours.toFixed(2)),
      totalExtraMinutes,
      leaveDaysAvailable,
      remainingMinutes,
      totalWorkedMinutes,
      totalWorkedHours: parseFloat((totalWorkedMinutes / 60).toFixed(2)),
      recordsWithExtraHours,
      totalRecords: recordsWithExtraHours.length,
    };
  } catch (error) {
    console.error("Error calculating extra hours:", error);
    return {
      userId,
      totalExtraHours: 0,
      totalExtraMinutes: 0,
      leaveDaysAvailable: 0,
      remainingMinutes: 0,
      totalWorkedMinutes: 0,
      totalWorkedHours: 0,
      recordsWithExtraHours: [],
      totalRecords: 0,
    };
  }
};

const calculateMonthlyExtraHoursSummary = async (userId, year, month) => {
  try {
    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    const attendanceRecords = await Attendance.find({
      userId,
      logoutTime: { $exists: true },
      isLeaveDay: { $ne: true },
      loginTime: { $gte: startDate, $lte: endDate },
    }).sort({ loginTime: -1 });

    let monthlyExtraMinutes = 0;
    let monthlyWorkedMinutes = 0;
    const monthlyRecordsWithExtraHours = [];

    attendanceRecords.forEach((record) => {
      if (record.loginTime && record.logoutTime) {
        const diffMs = new Date(record.logoutTime) - new Date(record.loginTime);
        const minutesWorked = Math.floor(diffMs / (1000 * 60));
        monthlyWorkedMinutes += minutesWorked;

        if (record.extraHoursInMinutes > 0 && !record.isLeaveDay) {
          monthlyExtraMinutes += record.extraHoursInMinutes;
          monthlyRecordsWithExtraHours.push({
            id: record._id,
            date: record.loginTime,
            extraHours: record.extraHours,
            extraHoursInMinutes: record.extraHoursInMinutes,
            totalTime: record.totalTime,
            workedHours: minutesWorked / 60,
          });
        }
      }
    });

    const monthlyExtraHours = monthlyExtraMinutes / 60;
    const monthlyLeaveDaysAvailable = Math.floor(monthlyExtraMinutes / 480);
    const monthlyRemainingMinutes = monthlyExtraMinutes % 480;

    return {
      userId,
      monthlyExtraHours: parseFloat(monthlyExtraHours.toFixed(2)),
      monthlyExtraMinutes,
      monthlyLeaveDaysAvailable,
      monthlyRemainingMinutes,
      monthlyWorkedMinutes,
      monthlyWorkedHours: parseFloat((monthlyWorkedMinutes / 60).toFixed(2)),
      monthlyRecordsWithExtraHours,
      monthlyTotalRecords: monthlyRecordsWithExtraHours.length,
    };
  } catch (error) {
    console.error("Error calculating monthly extra hours:", error);
    return {
      userId,
      monthlyExtraHours: 0,
      monthlyExtraMinutes: 0,
      monthlyLeaveDaysAvailable: 0,
      monthlyRemainingMinutes: 0,
      monthlyWorkedMinutes: 0,
      monthlyWorkedHours: 0,
      monthlyRecordsWithExtraHours: [],
      monthlyTotalRecords: 0,
    };
  }
};

const findExistingAttendance = async (userId, dateInput, session = null) => {
  const { start, end } = getDayRange(dateInput);
  const query = Attendance.findOne({
    userId,
    loginTime: { $gte: start, $lte: end },
  });
  if (session) query.session(session);
  return query.exec();
};

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /attendance – all attendance records
router.get("/attendance", async (req, res) => {
  try {
    const attendanceRecords = await Attendance.find().sort({ loginTime: -1 });
    res.json(attendanceRecords);
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// DELETE /attendance/:id – delete a single attendance record by ID
router.delete("/attendance/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid attendance record ID" });
    }

    const attendance = await Attendance.findById(id).session(session);
    if (!attendance) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Attendance record not found" });
    }

    const { userId, isLeaveDay, loginTime } = attendance;
    let warningMessage = null;

    // Format the deleted date for display
    const deletedDate = loginTime
      ? new Date(loginTime).toLocaleDateString("en-US", {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "unknown date";

    if (isLeaveDay) {
      // Leave‑day attendance → find associated swap leave and restore extra hours
      const { start, end } = getDayRange(loginTime);
      const swapLeave = await Leave.findOne({
        userId,
        leaveDate: { $gte: start, $lte: end },
        leaveType: "swapleave",
        status: "approved",
      }).session(session);

      if (swapLeave) {
        // Restore exact minutes to each source record
        for (const source of swapLeave.extraHoursSources) {
          const sourceRecord = await Attendance.findById(
            source.attendanceId,
          ).session(session);
          if (sourceRecord && !sourceRecord.isLeaveDay) {
            const currentExtra = sourceRecord.extraHoursInMinutes || 0;
            const newExtra = currentExtra + source.deductedMinutes;
            sourceRecord.extraHoursInMinutes = newExtra;
            sourceRecord.extraHours = formatMinutesToTimeString(newExtra);
            await sourceRecord.save({ session });
          }
        }
        await Leave.findByIdAndDelete(swapLeave._id).session(session);
        warningMessage = "Swap leave deleted and extra hours restored.";
      }
    } else {
      // Regular attendance → check if it was used as a source in any swap leave
      const dependentSwaps = await Leave.find({
        userId,
        leaveType: "swapleave",
        status: "approved",
        "extraHoursSources.attendanceId": id,
      }).session(session);

      if (dependentSwaps.length > 0) {
        for (const swap of dependentSwaps) {
          await Leave.findByIdAndDelete(swap._id).session(session);
        }
        warningMessage = `${dependentSwaps.length} swap leave(s) deleted because they depended on this attendance record.`;
      }
    }

    // Delete the attendance record
    await Attendance.findByIdAndDelete(id).session(session);

    // Enforce consistency
    await enforceExtraHoursConsistency(userId, session);

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: isLeaveDay
        ? `Leave day for ${deletedDate} deleted. ${warningMessage || ""}`
        : `Attendance record for ${deletedDate} deleted. ${warningMessage || ""}`,
      deletedId: id,
      deletedDate: deletedDate,
      warning: warningMessage,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Delete attendance error:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// DELETE /attendance/date/:userId/:date – delete attendance by user and date
router.delete("/attendance/date/:userId/:date", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD",
      });
    }

    const { start, end } = getDayRange(date);

    const attendance = await Attendance.findOne({
      userId,
      loginTime: { $gte: start, $lte: end },
    }).session(session);

    if (!attendance) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "No attendance record found for this user on the given date",
      });
    }

    const { isLeaveDay, loginTime: recordLogin } = attendance;
    let warningMessage = null;

    // Format the deleted date for display
    const deletedDate = new Date(date).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    if (isLeaveDay) {
      // Find associated swap leave
      const swapLeave = await Leave.findOne({
        userId,
        leaveDate: { $gte: start, $lte: end },
        leaveType: "swapleave",
        status: "approved",
      }).session(session);

      if (swapLeave) {
        // Restore exact minutes to each source record
        for (const source of swapLeave.extraHoursSources) {
          const sourceRecord = await Attendance.findById(
            source.attendanceId,
          ).session(session);
          if (sourceRecord && !sourceRecord.isLeaveDay) {
            const currentExtra = sourceRecord.extraHoursInMinutes || 0;
            const newExtra = currentExtra + source.deductedMinutes;
            sourceRecord.extraHoursInMinutes = newExtra;
            sourceRecord.extraHours = formatMinutesToTimeString(newExtra);
            await sourceRecord.save({ session });
          }
        }
        await Leave.findByIdAndDelete(swapLeave._id).session(session);
        warningMessage = "Swap leave deleted and extra hours restored.";
      }
    } else {
      // Regular attendance → check if it was used as a source
      const dependentSwaps = await Leave.find({
        userId,
        leaveType: "swapleave",
        status: "approved",
        "extraHoursSources.attendanceId": attendance._id,
      }).session(session);

      if (dependentSwaps.length > 0) {
        for (const swap of dependentSwaps) {
          await Leave.findByIdAndDelete(swap._id).session(session);
        }
        warningMessage = `${dependentSwaps.length} swap leave(s) deleted because they depended on this attendance record.`;
      }
    }

    await Attendance.findByIdAndDelete(attendance._id).session(session);
    await enforceExtraHoursConsistency(userId, session);

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: isLeaveDay
        ? `Leave day for ${deletedDate} deleted. ${warningMessage || ""}`
        : `Attendance record for ${deletedDate} deleted. ${warningMessage || ""}`,
      deletedDate: date,
      warning: warningMessage,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Delete attendance by date error:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// GET /holidays
router.get("/holidays", async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.json({ success: true, holidays });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// GET / – all leaves
router.get("/", async (req, res) => {
  try {
    const { leaveType, status } = req.query;
    const filter = {};
    if (leaveType) filter.leaveType = leaveType;
    if (status) filter.status = status;

    const leaves = await Leave.find(filter).sort({ leaveDate: -1 });
    res.json(leaves);
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// POST / – apply for leave
router.post("/", async (req, res) => {
  try {
    const { userId, leaveDate, reason, leaveType, status } = req.body;

    if (!userId || !leaveDate || !reason) {
      return res.status(400).json({
        success: false,
        message: "User ID, leave date, and reason are required",
      });
    }

    const validLeaveTypes = ["paid", "unpaid", "swapleave"];
    if (leaveType && !validLeaveTypes.includes(leaveType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave type. Must be 'paid', 'unpaid', or 'swapleave'",
      });
    }

    const parsedLeaveDate = new Date(leaveDate);
    parsedLeaveDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedLeaveDate > today) {
      return res.status(400).json({
        success: false,
        message: "Cannot apply for leave for future dates",
      });
    }

    if (parsedLeaveDate.getDay() === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot apply for leave on Sunday" });
    }

    const holidayCheck = await isHolidayOrSunday(parsedLeaveDate);
    if (holidayCheck.isHoliday && holidayCheck.reason !== "Sunday") {
      return res.status(400).json({
        success: false,
        message: `Cannot apply for leave on holiday: ${holidayCheck.reason}`,
      });
    }

    const existingAttendance = await findExistingAttendance(
      userId,
      parsedLeaveDate,
    );
    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: "Cannot apply for leave on a day with existing attendance",
      });
    }

    const { start, end } = getDayRange(parsedLeaveDate);
    const existingLeave = await Leave.findOne({
      userId,
      leaveDate: { $gte: start, $lte: end },
    });
    if (existingLeave) {
      return res.status(400).json({
        success: false,
        message: "Leave already exists for this date",
      });
    }

    const leave = new Leave({
      userId,
      leaveDate: parsedLeaveDate,
      reason,
      leaveType: leaveType || "unpaid",
      status: status || "approved",
    });

    await leave.save();

    res
      .status(201)
      .json({ success: true, message: "Leave applied successfully", leave });
  } catch (error) {
    console.error("Error applying leave:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// POST /attendance/record – record manual attendance
router.post("/attendance/record", async (req, res) => {
  try {
    const { userId, loginTime, logoutTime, workingHoursPerDay } = req.body;

    if (!userId || !loginTime || !logoutTime) {
      return res.status(400).json({
        success: false,
        message: "User ID, login time, and logout time are required",
      });
    }

    const parseDateTime = (datetimeStr) => {
      const dateTime = new Date(datetimeStr);
      const year = dateTime.getFullYear();
      const month = dateTime.getMonth();
      const day = dateTime.getDate();
      const hours = dateTime.getHours();
      const minutes = dateTime.getMinutes();
      const seconds = dateTime.getSeconds();
      return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    };

    const loginDateTime = parseDateTime(loginTime);
    const logoutDateTime = parseDateTime(logoutTime);

    if (logoutDateTime <= loginDateTime) {
      return res.status(400).json({
        success: false,
        message: "Logout time must be after login time",
      });
    }

    const checkDate = new Date(loginDateTime);
    const holidayCheck = await isHolidayOrSunday(checkDate);
    if (holidayCheck.isHoliday) {
      return res.status(400).json({
        success: false,
        message: `Cannot record attendance on ${holidayCheck.reason}`,
      });
    }

    const storedYear = loginDateTime.getUTCFullYear();
    const storedMonth = loginDateTime.getUTCMonth() + 1;
    const storedDay = loginDateTime.getUTCDate();
    const dateString = `${storedYear}-${String(storedMonth).padStart(2, "0")}-${String(storedDay).padStart(2, "0")}`;

    const existingAttendance = await findExistingAttendance(userId, dateString);
    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance already recorded for this user on the selected date",
      });
    }

    const diffMs = logoutDateTime - loginDateTime;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    const totalTime = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    const workingHours = workingHoursPerDay || 8;
    const totalMinutesWorked = Math.floor(diffMs / (1000 * 60));
    const expectedMinutes = workingHours * 60;

    let extraHours = "00:00:00";
    let extraHoursInMinutes = 0;
    if (totalMinutesWorked > expectedMinutes) {
      const extraMinutes = totalMinutesWorked - expectedMinutes;
      extraHoursInMinutes = extraMinutes;
      extraHours = formatMinutesToTimeString(extraMinutes);
    }

    const attendance = new Attendance({
      userId,
      loginTime: loginDateTime,
      logoutTime: logoutDateTime,
      totalTime,
      workingHoursPerDay: workingHours,
      extraHours,
      extraHoursInMinutes,
    });

    await attendance.save();

    res.status(201).json({
      success: true,
      message: "Attendance recorded successfully",
      attendance: {
        ...attendance.toObject(),
        loginTime: attendance.loginTime,
        logoutTime: attendance.logoutTime,
      },
    });
  } catch (error) {
    console.error("❌ Record Attendance Failed:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// POST /attendance/convert-to-leave – convert extra hours to leave (swap leave)
router.post("/attendance/convert-to-leave", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, date, leaveDays = 1, useMonthlyOnly = false } = req.body;

    if (!userId || !date) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "User ID and date are required" });
    }

    const [year, month, day] = date.split("-").map(Number);
    const leaveDate = new Date(year, month - 1, day, 9, 0, 0, 0);
    const leaveDateUTC = new Date(Date.UTC(year, month - 1, day, 9, 0, 0, 0));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(year, month - 1, day);
    checkDate.setHours(0, 0, 0, 0);
    if (checkDate > today) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Cannot convert leave for future dates",
      });
    }

    const holidayCheck = await isHolidayOrSunday(leaveDate);
    if (holidayCheck.isHoliday) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Cannot take leave on ${holidayCheck.reason}`,
      });
    }

    const existingAttendance = await findExistingAttendance(
      userId,
      date,
      session,
    );
    if (existingAttendance && !existingAttendance.isLeaveDay) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Regular attendance already exists for this date",
      });
    }

    const { start, end } = getDayRange(date);
    const existingLeave = await Leave.findOne({
      userId,
      leaveDate: { $gte: start, $lte: end },
      leaveType: "swapleave",
      status: "approved",
    }).session(session);
    if (existingLeave) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "A swap leave already exists for this date",
      });
    }

    const minutesNeeded = leaveDays * 480;

    const totalSummary = await calculateExtraHoursSummary(userId);
    if (totalSummary.totalExtraMinutes < minutesNeeded) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Insufficient total extra hours. Available: ${totalSummary.totalExtraHours.toFixed(2)} hours (${totalSummary.leaveDaysAvailable} days), Required: ${minutesNeeded / 60} hours (${leaveDays} days)`,
      });
    }

    if (useMonthlyOnly) {
      const monthlySummary = await calculateMonthlyExtraHoursSummary(
        userId,
        year,
        month - 1,
      );
      if (monthlySummary.monthlyExtraMinutes < minutesNeeded) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient monthly extra hours. Available this month: ${monthlySummary.monthlyExtraHours.toFixed(2)} hours (${monthlySummary.monthlyLeaveDaysAvailable} days), Required: ${minutesNeeded / 60} hours (${leaveDays} days)`,
        });
      }
    }

    // Deduct extra hours from oldest records first
    let minutesRemaining = minutesNeeded;
    const updatedRecords = [];
    let totalDeducted = 0;
    const sources = [];

    const recordsToDeduct = await Attendance.find({
      userId,
      extraHoursInMinutes: { $gt: 0 },
      isLeaveDay: { $ne: true },
    })
      .sort({ loginTime: 1 })
      .session(session);

    for (const rec of recordsToDeduct) {
      if (minutesRemaining <= 0) break;
      const original = rec.extraHoursInMinutes || 0;
      if (original <= 0) continue;
      const deduction = Math.min(original, minutesRemaining);
      const newMinutes = original - deduction;

      const updateResult = await Attendance.updateOne(
        { _id: rec._id, extraHoursInMinutes: original },
        {
          $set: {
            extraHoursInMinutes: newMinutes,
            extraHours: formatMinutesToTimeString(newMinutes),
            updatedAt: new Date(),
          },
        },
        { session },
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error(
          `Concurrent modification detected on record ${rec._id}. Please try again.`,
        );
      }

      updatedRecords.push({
        id: rec._id,
        date: rec.loginTime,
        original,
        deducted: deduction,
        remaining: newMinutes,
      });
      minutesRemaining -= deduction;
      totalDeducted += deduction;
      sources.push({
        attendanceId: rec._id,
        deductedMinutes: deduction,
      });
    }

    if (minutesRemaining > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({
        success: false,
        message: `Failed to deduct all required minutes. Only ${totalDeducted} of ${minutesNeeded} deducted.`,
      });
    }

    let leaveAttendance;
    if (existingAttendance && existingAttendance.isLeaveDay) {
      existingAttendance.remarks = `Leave converted from ${minutesNeeded / 60} extra working hours (${leaveDays} day${leaveDays > 1 ? "s" : ""})`;
      await existingAttendance.save({ session });
      leaveAttendance = existingAttendance;
    } else {
      leaveAttendance = new Attendance({
        userId,
        loginTime: leaveDateUTC,
        logoutTime: leaveDateUTC,
        totalTime: "00:00:00",
        workingHoursPerDay: 8,
        extraHours: "00:00:00",
        extraHoursInMinutes: 0,
        isLeaveDay: true,
        remarks: `Leave converted from ${minutesNeeded / 60} extra working hours (${leaveDays} day${leaveDays > 1 ? "s" : ""})`,
      });
      await leaveAttendance.save({ session });
    }

    const swapLeave = new Leave({
      userId,
      leaveDate: leaveDateUTC,
      reason: `Leave converted from ${leaveDays * 8} extra working hours`,
      leaveType: "swapleave",
      status: "approved",
      remarks: `Converted from extra hours on ${new Date().toISOString()}`,
      extraHoursSources: sources,
    });
    await swapLeave.save({ session });

    await session.commitTransaction();
    session.endSession();

    const updatedSummary = await calculateExtraHoursSummary(userId);

    res.json({
      success: true,
      message: `${leaveDays} leave day${leaveDays > 1 ? "s" : ""} successfully converted from extra hours!`,
      data: {
        leaveRecord: leaveAttendance,
        swapLeave,
        originalTotalExtraHours: totalSummary.totalExtraHours,
        updatedTotalExtraHours: updatedSummary.totalExtraHours,
        remainingLeaveDays: updatedSummary.leaveDaysAvailable,
        deductedMinutes: totalDeducted,
        updatedRecords,
      },
    });
  } catch (error) {
    console.error("❌ Conversion error:", error);
    await session.abortTransaction();
    session.endSession();
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// GET /attendance/extra-hours/:userId – extra hours summary (total + monthly)
router.get("/attendance/extra-hours/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query;

    const currentDate = new Date();
    const queryYear = year ? parseInt(year) : currentDate.getFullYear();
    const queryMonth =
      month !== undefined ? parseInt(month) : currentDate.getMonth();

    const totalSummary = await calculateExtraHoursSummary(userId);
    const monthlySummary = await calculateMonthlyExtraHoursSummary(
      userId,
      queryYear,
      queryMonth,
    );

    res.json({
      success: true,
      data: {
        ...totalSummary,
        monthlyExtraHours: monthlySummary.monthlyExtraHours,
        monthlyExtraMinutes: monthlySummary.monthlyExtraMinutes,
        monthlyLeaveDaysAvailable: monthlySummary.monthlyLeaveDaysAvailable,
        monthlyRemainingMinutes: monthlySummary.monthlyRemainingMinutes,
        monthlyWorkedMinutes: monthlySummary.monthlyWorkedMinutes,
        monthlyWorkedHours: monthlySummary.monthlyWorkedHours,
        monthlyRecordsWithExtraHours:
          monthlySummary.monthlyRecordsWithExtraHours,
        monthlyTotalRecords: monthlySummary.monthlyTotalRecords,
        isMonthly: month !== undefined,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// GET /extra-hours/:userId – simplified extra hours (backward-compatible)
router.get("/extra-hours/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query;

    const currentDate = new Date();
    const queryYear = year ? parseInt(year) : currentDate.getFullYear();
    const queryMonth =
      month !== undefined ? parseInt(month) : currentDate.getMonth();

    const allRecords = await Attendance.find({
      userId,
      isLeaveDay: { $ne: true },
    }).sort({ loginTime: 1 });

    const startOfMonth = new Date(queryYear, queryMonth, 1);
    const endOfMonth = new Date(queryYear, queryMonth + 1, 0, 23, 59, 59, 999);

    const monthlyRecords = allRecords.filter((record) => {
      const loginDate = new Date(record.loginTime);
      const logoutDate = new Date(record.logoutTime);
      return (
        (loginDate >= startOfMonth && loginDate <= endOfMonth) ||
        (logoutDate >= startOfMonth && logoutDate <= endOfMonth)
      );
    });

    const calcExtraFromRecord = (record) => {
      if (record.extraHoursInMinutes && record.extraHoursInMinutes > 0)
        return record.extraHoursInMinutes / 60;
      if (record.extraHours && record.extraHours !== "00:00:00") {
        const [h, m] = record.extraHours.split(":").map(Number);
        return h + m / 60;
      }
      if (record.loginTime && record.logoutTime) {
        const dur =
          (new Date(record.logoutTime) - new Date(record.loginTime)) /
          (1000 * 60 * 60);
        return Math.max(0, dur - 8);
      }
      return 0;
    };

    let totalExtraHours = 0;
    let monthlyExtraHours = 0;
    allRecords.forEach((r) => {
      totalExtraHours += calcExtraFromRecord(r);
    });
    monthlyRecords.forEach((r) => {
      monthlyExtraHours += calcExtraFromRecord(r);
    });

    const totalExtraMinutes = totalExtraHours * 60;
    const monthlyExtraMinutes = monthlyExtraHours * 60;
    const totalLeaveDaysAvailable = Math.floor(totalExtraMinutes / (8 * 60));
    const monthlyLeaveDaysAvailable = Math.floor(
      monthlyExtraMinutes / (8 * 60),
    );
    const totalRemainingMinutes = totalExtraMinutes % (8 * 60);
    const monthlyRemainingMinutes = monthlyExtraMinutes % (8 * 60);

    res.json({
      success: true,
      data: {
        totalExtraMinutes: Math.round(totalExtraMinutes),
        monthlyExtraMinutes: Math.round(monthlyExtraMinutes),
        totalExtraHours: parseFloat(totalExtraHours.toFixed(2)),
        monthlyExtraHours: parseFloat(monthlyExtraHours.toFixed(2)),
        totalLeaveDaysAvailable,
        monthlyLeaveDaysAvailable,
        totalRemainingHours: Math.floor(totalRemainingMinutes / 60),
        totalRemainingMinutes: Math.round(totalRemainingMinutes % 60),
        monthlyRemainingHours: Math.floor(monthlyRemainingMinutes / 60),
        monthlyRemainingMinutes: Math.round(monthlyRemainingMinutes % 60),
        allRecordsCount: allRecords.length,
        monthlyRecordsCount: monthlyRecords.length,
      },
    });
  } catch (error) {
    console.error("Error getting extra hours:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get extra hours: " + error.message,
    });
  }
});

router.get("/attendance/yesterday", async (req, res) => {
  try {
    // Get Yesterday's date range (instead of Today)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { start, end } = getDayRange(yesterday);
    console.log('valueso f start', start);
    console.log('values of end', end);
    const attendanceRecords = await Attendance.find({
      loginTime: { $gte: start, $lte: end },
    });
    const data = attendanceRecords.map((record) => ({
      userId: record.userId,
      isPresent: !record.isLeaveDay,
    }));
    res.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching today's attendance:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});
// GET /user/:userId – attendance records for one user
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const query = { userId };
    if (startDate && endDate) {
      query.loginTime = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const records = await Attendance.find(query).sort({ loginTime: 1 }).lean();
    res.json({ success: true, data: records, count: records.length });
  } catch (error) {
    console.error("Error getting user attendance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get attendance records: " + error.message,
    });
  }
});

export default router;
