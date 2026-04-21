import express from "express";
import mongoose from "mongoose";
import Attendance from "../../models/Hrm/Attendance.js";
import Leave from "../../models/Hrm/Leaves.js";
import Holiday from "../../models/Hrm/Holidays.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";

const router = express.Router();

// Utility helpers
const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatDateForLog = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return d.toISOString().split("T")[0];
};

// ─── Helper: format minutes → "HH:MM:SS" ─────────────────────────────────────
const formatMinutesToTimeString = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:00`;
};

// ─── Helper: determine attendance type and extra minutes ──────────────────────
const getAttendanceType = (totalMinutesWorked) => {
  const HALF_MIN = 4 * 60; // 240 min
  const FULL_MIN = 7 * 60; // 420 min – threshold to be counted as full

  if (totalMinutesWorked >= FULL_MIN) {
    return { type: "full", expectedMinutes: 8 * 60 };
  } else if (totalMinutesWorked >= HALF_MIN) {
    return { type: "half", expectedMinutes: 4 * 60 };
  } else {
    return { type: "short", expectedMinutes: 8 * 60 };
  }
};

// ─── Helper: UTC day range ────────────────────────────────────────────────────
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

// ─── Helper: check holiday / Sunday ──────────────────────────────────────────
const isHolidayOrSunday = async (date) => {
  const checkDate = new Date(date);
  if (checkDate.getDay() === 0) return { isHoliday: true, reason: "Sunday" };

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
  return holiday
    ? { isHoliday: true, reason: holiday.name }
    : { isHoliday: false, reason: null };
};

// ─── Helper: enforce extra-hours consistency ──────────────────────────────────
const enforceExtraHoursConsistency = async (userId, session = null) => {
  try {
    const attendanceRecords = await Attendance.find({
      userId,
      isLeaveDay: { $ne: true },
    }).session(session);

    let totalExtraMinutes = 0;
    attendanceRecords.forEach((rec) => {
      const expectedMinutes = rec.attendanceType === "half" ? 4 * 60 : 8 * 60;
      const workedMinutes = rec.totalTime
        ? (() => {
            const [h, m] = rec.totalTime.split(":").map(Number);
            return h * 60 + m;
          })()
        : 0;
      totalExtraMinutes += Math.max(0, workedMinutes - expectedMinutes);
    });

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

// ─── Helper: total extra-hours summary for a user ────────────────────────────
const calculateExtraHoursSummary = async (userId) => {
  try {
    const records = await Attendance.find({
      userId,
      logoutTime: { $exists: true },
      isLeaveDay: { $ne: true },
    }).sort({ loginTime: -1 });

    let totalExtraMinutes = 0;
    let totalWorkedMinutes = 0;
    const recordsWithExtra = [];

    records.forEach((rec) => {
      if (!rec.loginTime || !rec.logoutTime) return;
      const diffMs = new Date(rec.logoutTime) - new Date(rec.loginTime);
      const minutesWorked = Math.floor(diffMs / 60000);
      totalWorkedMinutes += minutesWorked;

      const { expectedMinutes } = getAttendanceType(minutesWorked);
      const extraMinutes = Math.max(0, minutesWorked - expectedMinutes);

      if (extraMinutes > 0) {
        totalExtraMinutes += extraMinutes;
        recordsWithExtra.push({
          id: rec._id,
          date: rec.loginTime,
          extraHours: formatMinutesToTimeString(extraMinutes),
          extraHoursInMinutes: extraMinutes,
          totalTime: rec.totalTime,
          workedHours: minutesWorked / 60,
          attendanceType: rec.attendanceType,
        });
      }
    });

    const leaveDaysAvailable = Math.floor(totalExtraMinutes / 480);
    return {
      userId,
      totalExtraHours: parseFloat((totalExtraMinutes / 60).toFixed(2)),
      totalExtraMinutes,
      leaveDaysAvailable,
      remainingMinutes: totalExtraMinutes % 480,
      totalWorkedMinutes,
      totalWorkedHours: parseFloat((totalWorkedMinutes / 60).toFixed(2)),
      recordsWithExtraHours: recordsWithExtra,
      totalRecords: recordsWithExtra.length,
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

// ─── Helper: monthly extra-hours summary ─────────────────────────────────────
const calculateMonthlyExtraHoursSummary = async (userId, year, month) => {
  try {
    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    const records = await Attendance.find({
      userId,
      logoutTime: { $exists: true },
      isLeaveDay: { $ne: true },
      loginTime: { $gte: startDate, $lte: endDate },
    }).sort({ loginTime: -1 });

    let monthlyExtraMinutes = 0;
    let monthlyWorkedMinutes = 0;
    const monthlyRecordsWithExtra = [];

    records.forEach((rec) => {
      if (!rec.loginTime || !rec.logoutTime) return;
      const diffMs = new Date(rec.logoutTime) - new Date(rec.loginTime);
      const minutesWorked = Math.floor(diffMs / 60000);
      monthlyWorkedMinutes += minutesWorked;

      const { expectedMinutes } = getAttendanceType(minutesWorked);
      const extraMinutes = Math.max(0, minutesWorked - expectedMinutes);

      if (extraMinutes > 0) {
        monthlyExtraMinutes += extraMinutes;
        monthlyRecordsWithExtra.push({
          id: rec._id,
          date: rec.loginTime,
          extraHours: formatMinutesToTimeString(extraMinutes),
          extraHoursInMinutes: extraMinutes,
          totalTime: rec.totalTime,
          workedHours: minutesWorked / 60,
          attendanceType: rec.attendanceType,
        });
      }
    });

    return {
      userId,
      monthlyExtraHours: parseFloat((monthlyExtraMinutes / 60).toFixed(2)),
      monthlyExtraMinutes,
      monthlyLeaveDaysAvailable: Math.floor(monthlyExtraMinutes / 480),
      monthlyRemainingMinutes: monthlyExtraMinutes % 480,
      monthlyWorkedMinutes,
      monthlyWorkedHours: parseFloat((monthlyWorkedMinutes / 60).toFixed(2)),
      monthlyRecordsWithExtraHours: monthlyRecordsWithExtra,
      monthlyTotalRecords: monthlyRecordsWithExtra.length,
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

// ═════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// GET /attendance – all attendance records
router.get("/attendance", async (req, res) => {
  try {
    const records = await Attendance.find().sort({ loginTime: -1 });
    res.json(records);
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// ─── GET /attendance/today ────────────────────────────────────────────────────
router.get("/attendance/today", async (req, res) => {
  try {
    const today = new Date();
    const { start, end } = getDayRange(today);
    const records = await Attendance.find({
      loginTime: { $gte: start, $lte: end },
    });

    const data = records.map((rec) => ({
      userId: rec.userId,
      isPresent: !rec.isLeaveDay,
      attendanceType: rec.attendanceType || "full",
      isHalfDay: rec.attendanceType === "half",
      totalTime: rec.totalTime,
      date: rec.loginTime,
    }));
    res.json({ success: true, data });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// ─── GET /attendance/yesterday ────────────────────────────────────────────────
router.get("/attendance/yesterday", async (req, res) => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { start, end } = getDayRange(yesterday);
    const records = await Attendance.find({
      loginTime: { $gte: start, $lte: end },
    });

    const data = records.map((rec) => ({
      userId: rec.userId,
      isPresent: !rec.isLeaveDay,
      attendanceType: rec.attendanceType || "full",
      totalTime: rec.totalTime,
      isHalfDay: rec.attendanceType === "half",
    }));
    res.json({ success: true, data });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// ─── DELETE /attendance/:id with activity logging ─────────────────────────────
router.delete("/attendance/:id", protect, allowAdminOnly, async (req, res) => {
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
    const deletedDate = loginTime
      ? formatDateForLog(loginTime)
      : "unknown date";

    if (isLeaveDay) {
      const { start, end } = getDayRange(loginTime);
      const swapLeave = await Leave.findOne({
        userId,
        leaveDate: { $gte: start, $lte: end },
        leaveType: "swapleave",
        status: "approved",
      }).session(session);

      if (swapLeave) {
        for (const source of swapLeave.extraHoursSources) {
          const sourceRecord = await Attendance.findById(
            source.attendanceId,
          ).session(session);
          if (sourceRecord && !sourceRecord.isLeaveDay) {
            const newExtra =
              (sourceRecord.extraHoursInMinutes || 0) + source.deductedMinutes;
            sourceRecord.extraHoursInMinutes = newExtra;
            sourceRecord.extraHours = formatMinutesToTimeString(newExtra);
            await sourceRecord.save({ session });
          }
        }
        await Leave.findByIdAndDelete(swapLeave._id).session(session);
        warningMessage = "Swap leave deleted and extra hours restored.";
      }
    } else {
      const dependentSwaps = await Leave.find({
        userId,
        leaveType: "swapleave",
        status: "approved",
        "extraHoursSources.attendanceId": id,
      }).session(session);

      if (dependentSwaps.length > 0) {
        for (const swap of dependentSwaps)
          await Leave.findByIdAndDelete(swap._id).session(session);
        warningMessage = `${dependentSwaps.length} swap leave(s) deleted because they depended on this attendance record.`;
      }
    }

    await Attendance.findByIdAndDelete(id).session(session);
    await enforceExtraHoursConsistency(userId, session);
    await session.commitTransaction();
    session.endSession();

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Attendance Record: ${attendance.attendanceType || "Unknown"} day on ${deletedDate}`,
      tableName: "attendance",
      tableLabel: "Attendance",
      recordId: attendance._id,
      referenceNumber: `${userId}_${deletedDate}`,
      previousData: attendance.toObject(),
      description: `Attendance record for user ${userId} on ${deletedDate} (${attendance.attendanceType || "unknown"}) deleted${warningMessage ? ` - ${warningMessage}` : ""}`,
      refField: "userId",
    });

    res.json({
      success: true,
      message: `Attendance record for ${deletedDate} deleted. ${warningMessage || ""}`,
      deletedId: id,
      deletedDate,
      warning: warningMessage,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// ─── DELETE /attendance/date/:userId/:date with activity logging ──────────────
router.delete(
  "/attendance/date/:userId/:date",
  protect,
  allowAdminOnly,
  async (req, res) => {
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

      const { isLeaveDay } = attendance;
      let warningMessage = null;
      const deletedDate = date;

      if (isLeaveDay) {
        const swapLeave = await Leave.findOne({
          userId,
          leaveDate: { $gte: start, $lte: end },
          leaveType: "swapleave",
          status: "approved",
        }).session(session);

        if (swapLeave) {
          for (const source of swapLeave.extraHoursSources) {
            const sourceRecord = await Attendance.findById(
              source.attendanceId,
            ).session(session);
            if (sourceRecord && !sourceRecord.isLeaveDay) {
              const newExtra =
                (sourceRecord.extraHoursInMinutes || 0) +
                source.deductedMinutes;
              sourceRecord.extraHoursInMinutes = newExtra;
              sourceRecord.extraHours = formatMinutesToTimeString(newExtra);
              await sourceRecord.save({ session });
            }
          }
          await Leave.findByIdAndDelete(swapLeave._id).session(session);
          warningMessage = "Swap leave deleted and extra hours restored.";
        }
      } else {
        const dependentSwaps = await Leave.find({
          userId,
          leaveType: "swapleave",
          status: "approved",
          "extraHoursSources.attendanceId": attendance._id,
        }).session(session);

        if (dependentSwaps.length > 0) {
          for (const swap of dependentSwaps)
            await Leave.findByIdAndDelete(swap._id).session(session);
          warningMessage = `${dependentSwaps.length} swap leave(s) deleted because they depended on this attendance record.`;
        }
      }

      await Attendance.findByIdAndDelete(attendance._id).session(session);
      await enforceExtraHoursConsistency(userId, session);
      await session.commitTransaction();
      session.endSession();

      // Log activity
      await logActivity(req, {
        action: "DELETE",
        actionLabel: `Deleted Attendance Record for User ${userId} on ${deletedDate}`,
        tableName: "attendance",
        tableLabel: "Attendance",
        recordId: attendance._id,
        referenceNumber: `${userId}_${deletedDate}`,
        previousData: attendance.toObject(),
        description: `Attendance record for user ${userId} on ${deletedDate} (${attendance.attendanceType || "unknown"}) deleted${warningMessage ? ` - ${warningMessage}` : ""}`,
        refField: "userId",
      });

      res.json({
        success: true,
        message: `Attendance record for ${deletedDate} deleted. ${warningMessage || ""}`,
        deletedDate: date,
        warning: warningMessage,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      res
        .status(500)
        .json({ success: false, message: "Server error: " + error.message });
    }
  },
);

// ─── GET /holidays ────────────────────────────────────────────────────────────
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

// ─── GET / – all leaves ───────────────────────────────────────────────────────
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

// ─── POST / – apply for leave with activity logging ───────────────────────────
router.post("/", protect, allowAdminOnly, async (req, res) => {
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

    if (parsedLeaveDate > today)
      return res.status(400).json({
        success: false,
        message: "Cannot apply for leave for future dates",
      });
    if (parsedLeaveDate.getDay() === 0)
      return res
        .status(400)
        .json({ success: false, message: "Cannot apply for leave on Sunday" });

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
    if (existingAttendance)
      return res.status(400).json({
        success: false,
        message: "Cannot apply for leave on a day with existing attendance",
      });

    const { start, end } = getDayRange(parsedLeaveDate);
    const existingLeave = await Leave.findOne({
      userId,
      leaveDate: { $gte: start, $lte: end },
    });
    if (existingLeave)
      return res.status(400).json({
        success: false,
        message: "Leave already exists for this date",
      });

    const leave = new Leave({
      userId,
      leaveDate: parsedLeaveDate,
      reason,
      leaveType: leaveType || "unpaid",
      status: status || "approved",
    });
    await leave.save();

    // Log activity
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Applied Leave for User ${userId}: ${leaveType || "unpaid"}`,
      tableName: "leaves",
      tableLabel: "Leave",
      recordId: leave._id,
      referenceNumber: `${userId}_${formatDateForLog(parsedLeaveDate)}`,
      newData: leave.toObject(),
      description: `${leaveType || "Unpaid"} leave applied for user ${userId} on ${formatDateForLog(parsedLeaveDate)}. Reason: ${reason}`,
      refField: "userId",
    });

    res
      .status(201)
      .json({ success: true, message: "Leave applied successfully", leave });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// ─── POST /attendance/record with activity logging ────────────────────────────
router.post("/attendance/record", protect, allowAdminOnly, async (req, res) => {
  try {
    const { userId, loginTime, logoutTime, workingHoursPerDay } = req.body;
    if (!userId || !loginTime || !logoutTime) {
      return res.status(400).json({
        success: false,
        message: "User ID, login time, and logout time are required",
      });
    }

    const parseDateTime = (str) => {
      const dt = new Date(str);
      return new Date(
        Date.UTC(
          dt.getFullYear(),
          dt.getMonth(),
          dt.getDate(),
          dt.getHours(),
          dt.getMinutes(),
          dt.getSeconds(),
        ),
      );
    };

    const loginDT = parseDateTime(loginTime);
    const logoutDT = parseDateTime(logoutTime);

    if (logoutDT <= loginDT) {
      return res.status(400).json({
        success: false,
        message: "Logout time must be after login time",
      });
    }

    const holidayCheck = await isHolidayOrSunday(loginDT);
    if (holidayCheck.isHoliday) {
      return res.status(400).json({
        success: false,
        message: `Cannot record attendance on ${holidayCheck.reason}`,
      });
    }

    const storedYear = loginDT.getUTCFullYear();
    const storedMonth = loginDT.getUTCMonth() + 1;
    const storedDay = loginDT.getUTCDate();
    const dateString = `${storedYear}-${String(storedMonth).padStart(2, "0")}-${String(storedDay).padStart(2, "0")}`;

    const existingAttendance = await findExistingAttendance(userId, dateString);
    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance already recorded for this user on the selected date",
      });
    }

    const diffMs = logoutDT - loginDT;
    const totalMinutesWorked = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutesWorked / 60);
    const minutes = totalMinutesWorked % 60;
    const totalTime = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`;

    const { type: attendanceType, expectedMinutes } =
      getAttendanceType(totalMinutesWorked);

    const extraMinutes = Math.max(0, totalMinutesWorked - expectedMinutes);
    const extraHoursInMinutes = extraMinutes;
    const extraHours = formatMinutesToTimeString(extraMinutes);

    const workingHours = workingHoursPerDay || 8;

    let remarkStr;
    if (attendanceType === "half") {
      remarkStr = `Half day (${totalTime} worked, ${extraMinutes} extra min above 4 h base)`;
    } else {
      remarkStr = `Full day (${totalTime} worked, ${extraMinutes} extra min above 8 h base)`;
    }

    const attendance = new Attendance({
      userId,
      loginTime: loginDT,
      logoutTime: logoutDT,
      totalTime,
      workingHoursPerDay: workingHours,
      extraHours,
      extraHoursInMinutes,
      attendanceType,
      remarks: remarkStr,
    });
    await attendance.save();

    // Log activity
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Recorded Attendance: ${attendanceType} day for User ${userId}`,
      tableName: "attendance",
      tableLabel: "Attendance",
      recordId: attendance._id,
      referenceNumber: `${userId}_${dateString}`,
      newData: attendance.toObject(),
      description: `${attendanceType.charAt(0).toUpperCase() + attendanceType.slice(1)} day attendance recorded for user ${userId} on ${dateString}. Worked: ${totalTime}, Extra: ${extraHours}`,
      refField: "userId",
    });

    res.status(201).json({
      success: true,
      message:
        attendanceType === "half"
          ? `Half-day attendance recorded successfully (${totalTime} worked)`
          : `Full-day attendance recorded successfully (${totalTime} worked)`,
      attendance: {
        ...attendance.toObject(),
        loginTime: attendance.loginTime,
        logoutTime: attendance.logoutTime,
        attendanceType,
        isHalfDay: attendanceType === "half",
        extraHoursInMinutes,
      },
    });
  } catch (error) {
    console.error("❌ Record Attendance Failed:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
});

// ─── POST /attendance/convert-to-leave with activity logging ──────────────────
router.post(
  "/attendance/convert-to-leave",
  protect,
  allowAdminOnly,
  async (req, res) => {
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

      const holidayCheck = await isHolidayOrSunday(leaveDateUTC);
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

      let minutesRemaining = minutesNeeded;
      const updatedRecords = [];
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
        if (updateResult.modifiedCount === 0)
          throw new Error(
            `Concurrent modification on record ${rec._id}. Please try again.`,
          );

        updatedRecords.push({
          id: rec._id,
          date: rec.loginTime,
          original,
          deducted: deduction,
          remaining: newMinutes,
        });
        minutesRemaining -= deduction;
        sources.push({ attendanceId: rec._id, deductedMinutes: deduction });
      }

      if (minutesRemaining > 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
          success: false,
          message: "Failed to deduct all required minutes.",
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
          attendanceType: "full",
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

      // Log activity
      await logActivity(req, {
        action: "CREATE",
        actionLabel: `Converted ${leaveDays} Day(s) to Leave for User ${userId}`,
        tableName: "leaves",
        tableLabel: "Leave",
        recordId: swapLeave._id,
        referenceNumber: `${userId}_${date}`,
        newData: swapLeave.toObject(),
        description: `${leaveDays} leave day(s) converted from extra hours for user ${userId} on ${date}. Used ${minutesNeeded} minutes of extra time.`,
        refField: "userId",
      });

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
          deductedMinutes: minutesNeeded - minutesRemaining,
          updatedRecords,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      res
        .status(500)
        .json({ success: false, message: "Server error: " + error.message });
    }
  },
);

// ─── GET /attendance/extra-hours/:userId ──────────────────────────────────────
router.get("/attendance/extra-hours/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query;
    const now = new Date();
    const queryYear = year ? parseInt(year) : now.getFullYear();
    const queryMonth = month !== undefined ? parseInt(month) : now.getMonth();

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

// ─── GET /extra-hours/:userId – simplified (backward-compatible) ──────────────
router.get("/extra-hours/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query;
    const now = new Date();
    const queryYear = year ? parseInt(year) : now.getFullYear();
    const queryMonth = month !== undefined ? parseInt(month) : now.getMonth();

    const allRecords = await Attendance.find({
      userId,
      isLeaveDay: { $ne: true },
    }).sort({ loginTime: 1 });

    const startOfMonth = new Date(queryYear, queryMonth, 1);
    const endOfMonth = new Date(queryYear, queryMonth + 1, 0, 23, 59, 59, 999);
    const monthlyRecords = allRecords.filter((rec) => {
      const loginDate = new Date(rec.loginTime);
      return loginDate >= startOfMonth && loginDate <= endOfMonth;
    });

    const calcExtra = (rec) => {
      if (rec.extraHoursInMinutes > 0) return rec.extraHoursInMinutes / 60;
      if (rec.extraHours && rec.extraHours !== "00:00:00") {
        const [h, m] = rec.extraHours.split(":").map(Number);
        return h + m / 60;
      }
      if (rec.loginTime && rec.logoutTime) {
        const dur =
          (new Date(rec.logoutTime) - new Date(rec.loginTime)) / 60000;
        const expected = rec.attendanceType === "half" ? 4 * 60 : 8 * 60;
        return Math.max(0, dur - expected) / 60;
      }
      return 0;
    };

    let totalExtraHours = 0;
    let monthlyExtraHours = 0;
    allRecords.forEach((r) => {
      totalExtraHours += calcExtra(r);
    });
    monthlyRecords.forEach((r) => {
      monthlyExtraHours += calcExtra(r);
    });

    const totalExtraMinutes = totalExtraHours * 60;
    const monthlyExtraMinutes = monthlyExtraHours * 60;

    res.json({
      success: true,
      data: {
        totalExtraMinutes: Math.round(totalExtraMinutes),
        monthlyExtraMinutes: Math.round(monthlyExtraMinutes),
        totalExtraHours: parseFloat(totalExtraHours.toFixed(2)),
        monthlyExtraHours: parseFloat(monthlyExtraHours.toFixed(2)),
        totalLeaveDaysAvailable: Math.floor(totalExtraMinutes / 480),
        monthlyLeaveDaysAvailable: Math.floor(monthlyExtraMinutes / 480),
        totalRemainingHours: Math.floor((totalExtraMinutes % 480) / 60),
        totalRemainingMinutes: Math.round(totalExtraMinutes % 60),
        monthlyRemainingHours: Math.floor((monthlyExtraMinutes % 480) / 60),
        monthlyRemainingMinutes: Math.round(monthlyExtraMinutes % 60),
        allRecordsCount: allRecords.length,
        monthlyRecordsCount: monthlyRecords.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get extra hours: " + error.message,
    });
  }
});

// ─── GET /user/:userId – attendance records for one user ─────────────────────
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    const query = { userId };
    if (startDate && endDate)
      query.loginTime = { $gte: new Date(startDate), $lte: new Date(endDate) };
    const records = await Attendance.find(query).sort({ loginTime: 1 }).lean();
    res.json({ success: true, data: records, count: records.length });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get attendance records: " + error.message,
    });
  }
});

export default router;
