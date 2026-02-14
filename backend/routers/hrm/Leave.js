import express from "express";
import mongoose from "mongoose";
import Attendance from "../../models/Hrm/Attendance.js";
import Leave from "../../models/Hrm/Leaves.js";
import Holiday from "../../models/Hrm/Holidays.js";

const router = express.Router();

// Helper function to format minutes to time string
const formatMinutesToTime = (minutes) => {
  if (minutes <= 0) return "00:00:00";
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:00`;
};

// Helper function to format minutes to HH:MM:SS
const formatMinutesToTimeString = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:00`;
};

// Helper function to check if a date is Sunday or holiday
const isHolidayOrSunday = async (date) => {
  const checkDate = new Date(date);

  // Check if Sunday
  if (checkDate.getDay() === 0) {
    return { isHoliday: true, reason: "Sunday" };
  }

  // Check if holiday - compare dates without time
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

// Calculate extra hours summary
const calculateExtraHoursSummary = async (userId) => {
  try {
    // Get all attendance records for the user that have extra hours
    const attendanceRecords = await Attendance.find({
      userId,
      logoutTime: { $exists: true },
    }).sort({ loginTime: -1 });

    let totalExtraMinutes = 0;
    let totalWorkedMinutes = 0;
    const recordsWithExtraHours = [];

    attendanceRecords.forEach((record) => {
      // Calculate worked minutes for each record
      if (record.loginTime && record.logoutTime) {
        const diffMs = new Date(record.logoutTime) - new Date(record.loginTime);
        const minutesWorked = Math.floor(diffMs / (1000 * 60));
        totalWorkedMinutes += minutesWorked;

        // Check if this record has extra hours (excluding leave days)
        if (
          record.extraHoursInMinutes &&
          record.extraHoursInMinutes > 0 &&
          !record.isLeaveDay
        ) {
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

    // Calculate leave days (8 hours = 480 minutes = 1 leave day)
    const totalExtraHours = totalExtraMinutes / 60;
    const leaveDaysAvailable = Math.floor(totalExtraMinutes / 480);
    const remainingMinutes = totalExtraMinutes % 480;

    return {
      userId: userId,
      totalExtraHours: parseFloat(totalExtraHours.toFixed(2)),
      totalExtraMinutes,
      leaveDaysAvailable,
      remainingMinutes,
      totalWorkedMinutes: totalWorkedMinutes,
      totalWorkedHours: parseFloat((totalWorkedMinutes / 60).toFixed(2)),
      recordsWithExtraHours,
      totalRecords: recordsWithExtraHours.length,
    };
  } catch (error) {
    console.error("Error calculating extra hours:", error);
    return {
      userId: userId,
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

// Calculate monthly extra hours summary
const calculateMonthlyExtraHoursSummary = async (userId, year, month) => {
  try {
    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    // Get attendance records for specific month
    const attendanceRecords = await Attendance.find({
      userId,
      logoutTime: { $exists: true },
      loginTime: { $gte: startDate, $lte: endDate },
    }).sort({ loginTime: -1 });

    let monthlyExtraMinutes = 0;
    let monthlyWorkedMinutes = 0;
    const monthlyRecordsWithExtraHours = [];

    attendanceRecords.forEach((record) => {
      // Calculate worked minutes for each record
      if (record.loginTime && record.logoutTime) {
        const diffMs = new Date(record.logoutTime) - new Date(record.loginTime);
        const minutesWorked = Math.floor(diffMs / (1000 * 60));
        monthlyWorkedMinutes += minutesWorked;

        // Check if this record has extra hours (excluding leave days)
        if (
          record.extraHoursInMinutes &&
          record.extraHoursInMinutes > 0 &&
          !record.isLeaveDay
        ) {
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

    // Calculate monthly leave days (8 hours = 480 minutes = 1 leave day)
    const monthlyExtraHours = monthlyExtraMinutes / 60;
    const monthlyLeaveDaysAvailable = Math.floor(monthlyExtraMinutes / 480);
    const monthlyRemainingMinutes = monthlyExtraMinutes % 480;

    return {
      userId: userId,
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
      userId: userId,
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

// =================== ROUTES ===================

// Get all attendance records
router.get("/attendance", async (req, res) => {
  try {
    const attendanceRecords = await Attendance.find()
      .populate("userId", "medicalRepName MRId")
      .sort({ loginTime: -1 });

    res.json(attendanceRecords);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});

// Get all holidays
router.get("/holidays", async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.json({
      success: true,
      holidays,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});

// Get all leaves with swapleave type (root endpoint)
router.get("/", async (req, res) => {
  try {
    const { leaveType, status } = req.query;
    let filter = {};

    // Add filters based on query parameters
    if (leaveType) filter.leaveType = leaveType;
    if (status) filter.status = status;

    const leaves = await Leave.find(filter)
      .populate("userId", "medicalRepName MRId email contactNo")
      .sort({ leaveDate: -1 });
    res.json(leaves);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});

// Apply for leave with swapleave type (root endpoint)
router.post("/", async (req, res) => {
  try {
    const { userId, leaveDate, reason, leaveType, status } = req.body;

    // Validate required fields
    if (!userId || !leaveDate || !reason) {
      return res.status(400).json({
        success: false,
        message: "User ID, leave date, and reason are required",
      });
    }

    // Validate leaveType
    const validLeaveTypes = ["paid", "unpaid", "swapleave"];
    if (leaveType && !validLeaveTypes.includes(leaveType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid leave type. Must be 'paid', 'unpaid', or 'swapleave'",
      });
    }

    // Parse the leave date
    const parsedLeaveDate = new Date(leaveDate);
    parsedLeaveDate.setHours(0, 0, 0, 0);

    // Check if date is in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedLeaveDate > today) {
      return res.status(400).json({
        success: false,
        message: "Cannot apply for leave for future dates",
      });
    }

    // Check if Sunday
    if (parsedLeaveDate.getDay() === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot apply for leave on Sunday",
      });
    }

    // Check if holiday
    const holidayCheck = await isHolidayOrSunday(parsedLeaveDate);
    if (holidayCheck.isHoliday && holidayCheck.reason !== "Sunday") {
      return res.status(400).json({
        success: false,
        message: `Cannot apply for leave on holiday: ${holidayCheck.reason}`,
      });
    }

    // Check if attendance already exists for this date
    const startOfDay = new Date(parsedLeaveDate);
    const endOfDay = new Date(parsedLeaveDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAttendance = await Attendance.findOne({
      userId,
      loginTime: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: "Cannot apply for leave on a day with existing attendance",
      });
    }

    // Check if leave already exists for this date
    const existingLeave = await Leave.findOne({
      userId,
      leaveDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    if (existingLeave) {
      return res.status(400).json({
        success: false,
        message: "Leave already exists for this date",
      });
    }

    // Create leave record
    const leave = new Leave({
      userId,
      leaveDate: parsedLeaveDate,
      reason,
      leaveType: leaveType || "unpaid", // Default to unpaid if not specified
      status: status || "approved",
    });

    await leave.save();
    await leave.populate("userId", "medicalRepName MRId");
    res.status(201).json({
      success: true,
      message: "Leave applied successfully",
      leave,
    });
  } catch (error) {
    console.error("Error applying leave:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});

// Record attendance (existing code remains the same)
router.post("/attendance/record", async (req, res) => {
  try {
    const { userId, loginTime, logoutTime, workingHoursPerDay } = req.body;

    if (!userId || !loginTime || !logoutTime) {
      return res.status(400).json({
        success: false,
        message: "User ID, login time, and logout time are required",
      });
    }

    // Parse the ISO string to extract date and time
    const parseDateTime = (datetimeStr) => {
      // Remove the timezone part if present
      const datetimeWithoutTz = datetimeStr.split("+")[0].split("-")[0];

      // Parse the date and time
      const dateTime = new Date(datetimeStr);

      // Get the local date and time components (this preserves 9:00 as 9:00)
      const year = dateTime.getFullYear();
      const month = dateTime.getMonth();
      const day = dateTime.getDate();
      const hours = dateTime.getHours();
      const minutes = dateTime.getMinutes();
      const seconds = dateTime.getSeconds();

      // Create a new Date object in UTC but with the same time components
      // This ensures 9:00 AM stays as 9:00 AM in the database
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

    // Create a date for checking holidays (using local time)
    const checkDate = new Date(loginDateTime);
    const holidayCheck = await isHolidayOrSunday(checkDate);

    if (holidayCheck.isHoliday) {
      return res.status(400).json({
        success: false,
        message: `Cannot record attendance on ${holidayCheck.reason}`,
      });
    }

    // Create start and end of day for the login date in UTC
    const loginDateOnly = new Date(loginDateTime);
    loginDateOnly.setUTCHours(0, 0, 0, 0);

    const nextDay = new Date(loginDateOnly);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const existingAttendance = await Attendance.findOne({
      userId,
      loginTime: {
        $gte: loginDateOnly,
        $lt: nextDay,
      },
    });


    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message:
          "Attendance already recorded for this user on the selected date",
      });
    }

    const diffMs = logoutDateTime - loginDateTime;
    // Calculate total time in HH:MM:SS format
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

    const attendanceData = {
      userId,
      loginTime: loginDateTime,
      logoutTime: logoutDateTime,
      totalTime,
      workingHoursPerDay: workingHours,
      extraHours,
      extraHoursInMinutes,
    };

    const attendance = new Attendance(attendanceData);
    await attendance.save();
    await attendance.populate("userId", "medicalRepName MRId");
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
    console.log("\n❌ ===== ERROR: Record Attendance Failed ===== ❌");
    console.log("  - Error message:", error.message);
    console.log("  - Error stack:", error.stack);

    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});

// Convert extra hours to leave (creates swapleave type)
router.post("/attendance/convert-to-leave", async (req, res) => {
  const session = await mongoose.startSession();
  let transactionInProgress = true;

  try {
    await session.startTransaction();
    const { userId, date, leaveDays = 1, useMonthlyOnly = false } = req.body;

    if (!userId || !date) {
      await session.abortTransaction();
      transactionInProgress = false;
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "User ID and date are required",
      });
    }

    // Parse date string YYYY-MM-DD
    const dateParts = date.split("-");
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1;
    const day = parseInt(dateParts[2]);

    // Create date at 9:00 AM in local time
    const leaveDate = new Date(year, month, day, 9, 0, 0, 0);

    // Convert to UTC for database storage
    const leaveDateUTC = new Date(Date.UTC(year, month, day, 9, 0, 0, 0));

    // Check if date is in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkLeaveDate = new Date(year, month, day);
    checkLeaveDate.setHours(0, 0, 0, 0);

    if (checkLeaveDate > today) {
      await session.abortTransaction();
      transactionInProgress = false;
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Cannot convert leave for future dates",
      });
    }

    // Check if holiday or Sunday
    const holidayCheck = await isHolidayOrSunday(leaveDate);
    if (holidayCheck.isHoliday) {
      await session.abortTransaction();
      transactionInProgress = false;
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Cannot take leave on ${holidayCheck.reason}`,
      });
    }

    // Check if attendance/leave already exists for this date
    const startOfDay = new Date(year, month, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month, day, 23, 59, 59, 999);

    const existingAttendance = await Attendance.findOne({
      userId,
      loginTime: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    }).session(session);

    if (existingAttendance) {
      // Allow if it's already a leave day (we can update it)
      if (existingAttendance.isLeaveDay) {
        // We can proceed to update
      } else {
        await session.abortTransaction();
        transactionInProgress = false;
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Attendance already recorded for this date",
        });
      }
    }

    // Calculate total extra hours summary
    const totalSummary = await calculateExtraHoursSummary(userId);
    const minutesNeeded = leaveDays * 480; // 8 hours * 60 minutes

    if (totalSummary.totalExtraMinutes < minutesNeeded) {
      await session.abortTransaction();
      transactionInProgress = false;
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Insufficient extra hours. Available: ${totalSummary.totalExtraHours.toFixed(2)} hours (${totalSummary.leaveDaysAvailable} days), Required: ${minutesNeeded / 60} hours (${leaveDays} days)`,
      });
    }

    if (useMonthlyOnly) {
      const leaveMonth = leaveDate.getMonth();
      const leaveYear = leaveDate.getFullYear();
      const monthlySummary = await calculateMonthlyExtraHoursSummary(
        userId,
        leaveYear,
        leaveMonth,
      );

      if (monthlySummary.monthlyExtraMinutes < minutesNeeded) {
        await session.abortTransaction();
        transactionInProgress = false;
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient monthly extra hours. Available this month: ${monthlySummary.monthlyExtraHours.toFixed(2)} hours (${monthlySummary.monthlyLeaveDaysAvailable} days), Required: ${minutesNeeded / 60} hours (${leaveDays} days)`,
        });
      }
    }

    // Create or update leave attendance record
    let leaveAttendance;

    if (existingAttendance && existingAttendance.isLeaveDay) {
      // Update existing leave day
      existingAttendance.remarks = `Leave converted from ${minutesNeeded / 60} extra working hours (${leaveDays} day${leaveDays > 1 ? "s" : ""})`;
      await existingAttendance.save({ session });
      leaveAttendance = existingAttendance;
    } else {
      // Create new leave attendance record
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

    // Deduct extra hours from attendance records
    let minutesRemaining = minutesNeeded;
    const updatedRecords = [];
    let totalDeducted = 0;

    // Get all records with extra hours, sorted by date (oldest first)
    const allRecords = await Attendance.find({
      userId,
      extraHoursInMinutes: { $gt: 0 },
      isLeaveDay: { $ne: true }, // Don't deduct from other leave days
    })
      .sort({ loginTime: 1 })
      .session(session);

    for (let i = 0; i < allRecords.length; i++) {
      const attendance = allRecords[i];
      if (minutesRemaining <= 0) {
        break;
      }

      const originalMinutes = attendance.extraHoursInMinutes || 0;
      if (originalMinutes <= 0) {
        continue;
      }

      const deduction = Math.min(originalMinutes, minutesRemaining);
      const newExtraMinutes = originalMinutes - deduction;

      // Update the attendance record
      attendance.extraHoursInMinutes = newExtraMinutes;
      attendance.extraHours = formatMinutesToTimeString(newExtraMinutes);
      attendance.updatedAt = new Date();

      await attendance.save({ session });

      updatedRecords.push({
        id: attendance._id,
        date: attendance.loginTime,
        originalMinutes,
        deducted: deduction,
        remainingMinutes: newExtraMinutes,
        extraHours: attendance.extraHours,
      });

      minutesRemaining -= deduction;
      totalDeducted += deduction;

      if (minutesRemaining === 0) {
        break;
      }
    }

    if (minutesRemaining > 0) {
      await session.abortTransaction();
      transactionInProgress = false;
      session.endSession();
      if (!existingAttendance) {
        await Attendance.findByIdAndDelete(leaveAttendance._id);
      }
      return res.status(500).json({
        success: false,
        message: `Failed to deduct all required minutes. Only ${totalDeducted} minutes were deducted out of ${minutesNeeded} needed.`,
      });
    }

    // Create or update a leave record in the Leave collection with leaveType "swapleave"
    const existingLeave = await Leave.findOne({
      userId,
      leaveDate: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    }).session(session);

    if (existingLeave) {
      // Update existing leave
      existingLeave.leaveType = "swapleave"; // Set as swapleave
      existingLeave.reason = `Leave converted from ${leaveDays * 8} extra working hours`;
      existingLeave.remarks = `Converted from extra hours on ${new Date().toISOString()}`;
      await existingLeave.save({ session });
    } else {
      // Create new leave record with leaveType "swapleave"
      const leaveRecord = new Leave({
        userId,
        leaveDate: leaveDateUTC,
        reason: `Leave converted from ${leaveDays * 8} extra working hours`,
        leaveType: "swapleave", // This is the key change
        status: "approved",
        remarks: `Converted from extra hours on ${new Date().toISOString()}`,
      });

      await leaveRecord.save({ session });
    }

    // Commit transaction
    await session.commitTransaction();
    transactionInProgress = false;
    session.endSession();

    // Fetch updated data
    await leaveAttendance.populate("userId", "medicalRepName MRId");
    const updatedSummary = await calculateExtraHoursSummary(userId);

    res.json({
      success: true,
      message: `${leaveDays} leave day${leaveDays > 1 ? "s" : ""} successfully converted from extra hours!`,
      data: {
        leaveRecord: {
          _id: leaveAttendance._id,
          userId: leaveAttendance.userId,
          loginTime: leaveAttendance.loginTime,
          logoutTime: leaveAttendance.logoutTime,
          totalTime: leaveAttendance.totalTime,
          workingHoursPerDay: leaveAttendance.workingHoursPerDay,
          extraHours: leaveAttendance.extraHours,
          extraHoursInMinutes: leaveAttendance.extraHoursInMinutes,
          isLeaveDay: leaveAttendance.isLeaveDay,
          remarks: leaveAttendance.remarks,
        },
        originalTotalExtraHours: totalSummary.totalExtraHours,
        originalTotalExtraMinutes: totalSummary.totalExtraMinutes,
        updatedTotalExtraHours: updatedSummary.totalExtraHours,
        updatedTotalExtraMinutes: updatedSummary.totalExtraMinutes,
        remainingLeaveDays: updatedSummary.leaveDaysAvailable,
        deductedMinutes: totalDeducted,
        updatedRecords: updatedRecords,
        updatedRecordsCount: updatedRecords.length,
        usedMonthlyOnly: useMonthlyOnly,
      },
    });
  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error);

    try {
      if (transactionInProgress) {
        await session.abortTransaction();
      }
    } catch (abortError) {
      console.error("❌ Failed to abort transaction:", abortError.message);
    } finally {
      session.endSession();
    }

    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});

// Get extra hours summary for a user
router.get("/extra-hours/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const currentDate = new Date();
    const queryYear = year || currentDate.getFullYear();
    const queryMonth =
      month !== undefined ? parseInt(month) : currentDate.getMonth();

    // Get all attendance records for the user (excluding leave days)
    const allRecords = await Attendance.find({
      userId,
      isLeaveDay: { $ne: true },
    }).sort({ loginTime: 1 });

    // Get monthly records
    const startOfMonth = new Date(queryYear, queryMonth, 1);
    const endOfMonth = new Date(queryYear, queryMonth + 1, 0, 23, 59, 59, 999);

    const monthlyRecords = allRecords.filter((record) => {
      const loginDate = new Date(record.loginTime);
      const logoutDate = new Date(record.logoutTime);

      // Check if the record overlaps with the month
      return (
        (loginDate >= startOfMonth && loginDate <= endOfMonth) ||
        (logoutDate >= startOfMonth && logoutDate <= endOfMonth)
      );
    });

    // Function to calculate extra hours from a record
    const calculateExtraHoursFromRecord = (record) => {
      // First try to use extraHoursInMinutes
      if (record.extraHoursInMinutes && record.extraHoursInMinutes > 0) {
        return record.extraHoursInMinutes / 60;
      }

      // Then try to use extraHours string
      if (record.extraHours && record.extraHours !== "00:00:00") {
        const timeParts = record.extraHours.split(":");
        if (timeParts.length === 3) {
          const hours = parseInt(timeParts[0]) || 0;
          const minutes = parseInt(timeParts[1]) || 0;
          const seconds = parseInt(timeParts[2]) || 0;
          return hours + minutes / 60 + seconds / 3600;
        }
      }

      // Finally, calculate from login/logout times
      if (record.loginTime && record.logoutTime) {
        const login = new Date(record.loginTime);
        const logout = new Date(record.logoutTime);
        const durationHours = (logout - login) / (1000 * 60 * 60);
        return Math.max(0, durationHours - 8);
      }

      return 0;
    };

    // Calculate total extra hours
    let totalExtraHours = 0;
    let monthlyExtraHours = 0;

    allRecords.forEach((record) => {
      const extraHours = calculateExtraHoursFromRecord(record);
      totalExtraHours += extraHours;
    });

    // Calculate monthly extra hours
    monthlyRecords.forEach((record) => {
      const extraHours = calculateExtraHoursFromRecord(record);
      monthlyExtraHours += extraHours;
    });

    // Convert to minutes for leave day calculation
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

// Get all attendance records for a user (for debugging)
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    let query = { userId };

    if (startDate && endDate) {
      query.loginTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const records = await Attendance.find(query).sort({ loginTime: 1 }).lean();

    // Format the response
    const formattedRecords = records.map((record) => ({
      _id: record._id,
      userId: record.userId,
      loginTime: record.loginTime,
      logoutTime: record.logoutTime,
      totalTime: record.totalTime,
      workingHoursPerDay: record.workingHoursPerDay,
      extraHours: record.extraHours,
      extraHoursInMinutes: record.extraHoursInMinutes,
      isLeaveDay: record.isLeaveDay,
      remarks: record.remarks,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));

    res.json({
      success: true,
      data: formattedRecords,
      count: formattedRecords.length,
    });
  } catch (error) {
    console.error("Error getting user attendance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get attendance records: " + error.message,
    });
  }
});

// Get extra hours summary for specific MR
router.get("/attendance/extra-hours/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query;

    let summary;
    let monthlySummary = null;

    if (year && month !== undefined) {
      // Get monthly summary
      monthlySummary = await calculateMonthlyExtraHoursSummary(
        userId,
        parseInt(year),
        parseInt(month),
      );
    }

    // Get total summary
    const totalSummary = await calculateExtraHoursSummary(userId);

    res.json({
      success: true,
      data: {
        ...totalSummary,
        monthlyExtraHours: monthlySummary
          ? monthlySummary.monthlyExtraHours
          : 0,
        monthlyExtraMinutes: monthlySummary
          ? monthlySummary.monthlyExtraMinutes
          : 0,
        monthlyLeaveDaysAvailable: monthlySummary
          ? monthlySummary.monthlyLeaveDaysAvailable
          : 0,
        monthlyRemainingMinutes: monthlySummary
          ? monthlySummary.monthlyRemainingMinutes
          : 0,
        monthlyWorkedMinutes: monthlySummary
          ? monthlySummary.monthlyWorkedMinutes
          : 0,
        monthlyWorkedHours: monthlySummary
          ? monthlySummary.monthlyWorkedHours
          : 0,
        monthlyRecordsWithExtraHours: monthlySummary
          ? monthlySummary.monthlyRecordsWithExtraHours
          : [],
        monthlyTotalRecords: monthlySummary
          ? monthlySummary.monthlyTotalRecords
          : 0,
        isMonthly: month !== undefined,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});

export default router;