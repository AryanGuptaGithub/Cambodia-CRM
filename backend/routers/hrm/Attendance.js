import express from "express";
import Attendance from "../../models/Hrm/Attendance.js";
import Holiday from "../../models/Hrm/Holidays.js";
import mongoose from "mongoose";

const router = express.Router();

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
    date: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });

  if (holiday) {
    return { isHoliday: true, reason: holiday.name };
  }

  return { isHoliday: false, reason: null };
};

// NEW: Calculate extra hours and convert to leave days - FIXED FOR CROSS-DAY WORKING
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
    const leaveDaysAvailable = Math.floor(totalExtraMinutes / 480); // 8 hours in minutes
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

// NEW: Calculate monthly extra hours summary - FIXED
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

// Helper function to format minutes to HH:MM:SS
const formatMinutesToTimeString = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:00`;
};

// NEW: Get extra hours summary for specific MR - FIXED
router.get("/attendance/extra-hours/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query; // Optional: Get specific month data

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

router.post("/attendance/convert-to-leave", async (req, res) => {
  console.log("🔄 POST /attendance/convert-to-leave called");
  console.log("📦 Request body:", req.body);
  
  const session = await mongoose.startSession();
  let transactionInProgress = true;

  try {
    await session.startTransaction();
    console.log("✅ Transaction started");

    const { userId, date, leaveDays = 1, useMonthlyOnly = false } = req.body;
    console.log("✅ Parsed parameters:");
    console.log("   - userId:", userId);
    console.log("   - date:", date);
    console.log("   - leaveDays:", leaveDays);
    console.log("   - useMonthlyOnly:", useMonthlyOnly);
    
    if (!userId || !date) {
      console.log("❌ Validation failed: Missing userId or date");
      await session.abortTransaction();
      transactionInProgress = false;
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "User ID and date are required",
      });
    }

    const selectedDate = new Date(date);
    console.log("📅 Parsed selectedDate:", selectedDate);
    
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    console.log("📅 Today (UTC start of day):", today);
    
    const selectedDateStart = new Date(selectedDate);
    selectedDateStart.setUTCHours(0, 0, 0, 0);
    console.log("📅 Selected date (UTC start of day):", selectedDateStart);

    if (selectedDateStart > today) {
      console.log("❌ Error: Selected date is in the future");
      await session.abortTransaction();
      transactionInProgress = false;
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Cannot convert leave for future dates. You can only convert leave for today or past dates.",
      });
    }

    console.log("🔍 Checking if date is holiday or Sunday...");
    const holidayCheck = await isHolidayOrSunday(selectedDate);
    console.log("📊 Holiday check result:", holidayCheck);
    
    if (holidayCheck.isHoliday) {
      console.log("❌ Error: Date is a holiday or Sunday");
      await session.abortTransaction();
      transactionInProgress = false;
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Cannot take leave on ${holidayCheck.reason}`,
      });
    }

    const checkDate = new Date(date);
    checkDate.setUTCHours(0, 0, 0, 0);
    const nextDay = new Date(checkDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    
    console.log("🔍 Checking for existing attendance on this date...");
    console.log("   - Date range:", checkDate, "to", nextDay);

    const existingAttendance = await Attendance.findOne({
      userId,
      loginTime: {
        $gte: checkDate,
        $lt: nextDay,
      },
    }).session(session);

    console.log("📊 Existing attendance check result:", existingAttendance ? "Found" : "Not found");
    
    if (existingAttendance) {
      console.log("❌ Error: Attendance already exists for this date");
      await session.abortTransaction();
      transactionInProgress = false;
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Attendance/Leave already recorded for this date",
      });
    }

    console.log("📈 Calculating extra hours summary for user...");
    const totalSummary = await calculateExtraHoursSummary(userId);
    console.log("📊 Extra hours summary:");
    console.log("   - totalExtraHours:", totalSummary.totalExtraHours);
    console.log("   - totalExtraMinutes:", totalSummary.totalExtraMinutes);
    console.log("   - leaveDaysAvailable:", totalSummary.leaveDaysAvailable);

    const minutesNeeded = leaveDays * 480;
    console.log("🧮 Minutes calculation:");
    console.log("   - leaveDays:", leaveDays);
    console.log("   - minutesNeeded (leaveDays * 480):", minutesNeeded);
    console.log("   - hoursNeeded:", minutesNeeded / 60);

    console.log("⚖️ Checking if sufficient extra hours exist...");
    console.log("   - Available minutes:", totalSummary.totalExtraMinutes);
    console.log("   - Required minutes:", minutesNeeded);
    
    if (totalSummary.totalExtraMinutes < minutesNeeded) {
      console.log("❌ Error: Insufficient extra hours");
      await session.abortTransaction();
      transactionInProgress = false;
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Insufficient extra hours. Available: ${totalSummary.totalExtraHours.toFixed(2)} hours (${totalSummary.leaveDaysAvailable} days), Required: ${minutesNeeded / 60} hours (${leaveDays} days)`,
      });
    }

    if (useMonthlyOnly) {
      console.log("📅 Checking monthly availability (useMonthlyOnly=true)...");
      const leaveMonth = selectedDate.getMonth();
      const leaveYear = selectedDate.getFullYear();
      const monthlySummary = await calculateMonthlyExtraHoursSummary(
        userId,
        leaveYear,
        leaveMonth,
      );
      
      console.log("📊 Monthly summary:", monthlySummary);
      
      if (monthlySummary.monthlyExtraMinutes < minutesNeeded) {
        console.log("❌ Error: Insufficient monthly extra hours");
        await session.abortTransaction();
        transactionInProgress = false;
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient monthly extra hours. Available this month: ${monthlySummary.monthlyExtraHours.toFixed(2)} hours (${monthlySummary.monthlyLeaveDaysAvailable} days), Required: ${minutesNeeded / 60} hours (${leaveDays} days)`,
        });
      }
    }

    const leaveDate = new Date(date);
    leaveDate.setUTCHours(9, 0, 0, 0);
    console.log("📅 Creating leave record with date:", leaveDate);

    const leaveRecord = new Attendance({
      userId,
      loginTime: leaveDate,
      logoutTime: leaveDate,
      totalTime: "00:00:00",
      workingHoursPerDay: 8,
      extraHours: "00:00:00",
      extraHoursInMinutes: 0,
      isLeaveDay: true,
      leaveType: "extra_hours_converted",
      remarks: `Leave converted from ${minutesNeeded / 60} extra working hours (${leaveDays} day${leaveDays > 1 ? "s" : ""})`,
    });

    console.log("📝 Leave record to be saved:");
    console.log("   - userId:", leaveRecord.userId);
    console.log("   - loginTime:", leaveRecord.loginTime);
    console.log("   - isLeaveDay:", leaveRecord.isLeaveDay);
    console.log("   - remarks:", leaveRecord.remarks);

    await leaveRecord.save({ session });
    console.log("✅ Leave record saved successfully");
    console.log("   - Leave record ID:", leaveRecord._id);

    let minutesRemaining = minutesNeeded;
    const updatedRecords = [];
    let totalDeducted = 0;

    console.log("🔍 Fetching all attendance records with extra hours...");
    console.log("   - Filter: userId =", userId);
    console.log("   - Filter: extraHoursInMinutes > 0");
    console.log("   - Filter: isLeaveDay != true");
    console.log("   - Sort: loginTime ascending");

    const allRecords = await Attendance.find({
      userId,
      extraHoursInMinutes: { $gt: 0 },
      isLeaveDay: { $ne: true },
    })
      .sort({ loginTime: 1 })
      .session(session);

    console.log("📊 Found records with extra hours:");
    console.log("   - Total records:", allRecords.length);
    
    allRecords.forEach((record, index) => {
      console.log(`   Record ${index + 1}:`);
      console.log(`     - _id: ${record._id}`);
      console.log(`     - loginTime: ${record.loginTime}`);
      console.log(`     - extraHours: ${record.extraHours}`);
      console.log(`     - extraHoursInMinutes: ${record.extraHoursInMinutes}`);
      console.log(`     - isLeaveDay: ${record.isLeaveDay}`);
    });

    console.log("\n💰 STARTING DEDUCTION PROCESS");
    console.log("===============================");
    console.log(`Total minutes needed: ${minutesNeeded} (${minutesNeeded / 60} hours)`);
    console.log(`Total records to process: ${allRecords.length}`);

    for (let i = 0; i < allRecords.length; i++) {
      const attendance = allRecords[i];
      console.log(`\n--- Processing Record ${i + 1}/${allRecords.length} ---`);
      console.log(`Record ID: ${attendance._id}`);
      console.log(`Record date: ${attendance.loginTime}`);

      if (minutesRemaining <= 0) {
        console.log(`⏹️  No more minutes to deduct. Stopping.`);
        break;
      }

      const originalMinutes = attendance.extraHoursInMinutes || 0;
      console.log(`📊 Original values:`);
      console.log(`   - extraHoursInMinutes: ${originalMinutes}`);
      console.log(`   - extraHours: ${attendance.extraHours}`);
      
      if (originalMinutes <= 0) {
        console.log(`⚠️  Record has 0 or negative extra minutes, skipping`);
        continue;
      }

      const deduction = Math.min(originalMinutes, minutesRemaining);
      const newExtraMinutes = originalMinutes - deduction;
      
      console.log(`🧮 Deduction calculation:`);
      console.log(`   - Minutes available: ${originalMinutes}`);
      console.log(`   - Minutes still needed: ${minutesRemaining}`);
      console.log(`   - Will deduct: ${deduction} minutes`);
      console.log(`   - Will leave: ${newExtraMinutes} minutes in record`);

      // Format new extra hours
      const hours = Math.floor(newExtraMinutes / 60);
      const minutes = newExtraMinutes % 60;
      const newExtraHours = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
      
      console.log(`🔢 Formatting minutes to HH:MM:SS:`);
      console.log(`   - newExtraMinutes: ${newExtraMinutes}`);
      console.log(`   - hours: ${hours}`);
      console.log(`   - minutes: ${minutes}`);
      console.log(`   - newExtraHours: "${newExtraHours}"`);

      console.log(`✏️  Updating record...`);
      console.log(`   - Before update - extraHoursInMinutes: ${attendance.extraHoursInMinutes}`);
      console.log(`   - Before update - extraHours: "${attendance.extraHours}"`);
      
      // Use findOneAndUpdate to ensure the update happens
      const updateResult = await Attendance.findOneAndUpdate(
        { _id: attendance._id },
        {
          $set: {
            extraHoursInMinutes: newExtraMinutes,
            extraHours: newExtraHours,
            updatedAt: new Date()
          }
        },
        {
          session: session,
          new: true, // Return the updated document
          runValidators: true
        }
      );

      if (!updateResult) {
        console.log(`❌ Error: Failed to update record ${attendance._id}`);
        throw new Error(`Failed to update attendance record ${attendance._id}`);
      }

      console.log(`✅ Record updated successfully using findOneAndUpdate`);
      console.log(`   - Updated extraHoursInMinutes: ${updateResult.extraHoursInMinutes}`);
      console.log(`   - Updated extraHours: "${updateResult.extraHours}"`);

      // Update the local object for consistency
      attendance.extraHoursInMinutes = newExtraMinutes;
      attendance.extraHours = newExtraHours;

      console.log(`🔍 Verifying update by fetching record again...`);
      const verifiedRecord = await Attendance.findById(attendance._id).session(session);
      console.log(`📋 Verification results:`);
      console.log(`   - Verified extraHoursInMinutes: ${verifiedRecord.extraHoursInMinutes}`);
      console.log(`   - Verified extraHours: "${verifiedRecord.extraHours}"`);
      console.log(`   - Expected extraHoursInMinutes: ${newExtraMinutes}`);
      console.log(`   - Expected extraHours: "${newExtraHours}"`);
      
      if (verifiedRecord.extraHoursInMinutes === newExtraMinutes && verifiedRecord.extraHours === newExtraHours) {
        console.log(`✅ Verification PASSED`);
      } else {
        console.log(`❌ Verification FAILED`);
        console.log(`   - Database value mismatch detected`);
      }

      updatedRecords.push({
        id: attendance._id,
        date: attendance.loginTime,
        originalMinutes,
        deducted: deduction,
        remainingMinutes: newExtraMinutes,
        extraHours: newExtraHours,
      });

      minutesRemaining -= deduction;
      totalDeducted += deduction;
      
      console.log(`📈 Updated totals:`);
      console.log(`   - Minutes deducted from this record: ${deduction}`);
      console.log(`   - Total deducted so far: ${totalDeducted}`);
      console.log(`   - Minutes remaining to deduct: ${minutesRemaining}`);

      if (minutesRemaining === 0) {
        console.log(`🎯 All minutes have been deducted!`);
        break;
      }
    }

    console.log("\n📊 DEDUCTION PROCESS COMPLETE");
    console.log("=============================");
    console.log(`Total minutes needed: ${minutesNeeded}`);
    console.log(`Total minutes deducted: ${totalDeducted}`);
    console.log(`Minutes remaining: ${minutesRemaining}`);
    console.log(`Records updated: ${updatedRecords.length}`);

    if (minutesRemaining > 0) {
      console.log(`❌ ERROR: Not all minutes were deducted!`);
      console.log(`   - ${minutesRemaining} minutes remain undeducted`);
      console.log(`🔄 Rolling back transaction and deleting leave record...`);
      
      await session.abortTransaction();
      transactionInProgress = false;
      session.endSession();
      
      console.log(`🗑️ Deleting leave record ${leaveRecord._id}...`);
      await Attendance.findByIdAndDelete(leaveRecord._id);
      
      return res.status(500).json({
        success: false,
        message: `Failed to deduct all required minutes. Only ${totalDeducted} minutes were deducted out of ${minutesNeeded} needed.`,
      });
    }

    console.log(`✅ All minutes successfully deducted`);
    console.log(`💾 Committing transaction...`);
    
    await session.commitTransaction();
    transactionInProgress = false;
    console.log(`✅ Transaction committed successfully`);
    
    console.log(`🔚 Ending session...`);
    session.endSession();
    console.log(`✅ Session ended`);

    console.log(`👤 Populating user details...`);
    await leaveRecord.populate("userId", "medicalRepName MRId");
    
    console.log(`📈 Getting updated summary...`);
    const updatedSummary = await calculateExtraHoursSummary(userId);
    
    console.log(`📊 Updated summary:`);
    console.log(`   - totalExtraHours: ${updatedSummary.totalExtraHours}`);
    console.log(`   - totalExtraMinutes: ${updatedSummary.totalExtraMinutes}`);
    console.log(`   - leaveDaysAvailable: ${updatedSummary.leaveDaysAvailable}`);

    console.log(`📋 Detailed update summary for each record:`);
    updatedRecords.forEach((record, index) => {
      console.log(`   Record ${index + 1}:`);
      console.log(`     - ID: ${record.id}`);
      console.log(`     - Date: ${record.date.toISOString().split('T')[0]}`);
      console.log(`     - Original minutes: ${record.originalMinutes}`);
      console.log(`     - Deducted: ${record.deducted} minutes`);
      console.log(`     - Remaining: ${record.remainingMinutes} minutes`);
      console.log(`     - New extraHours: "${record.extraHours}"`);
    });

    console.log(`📤 Sending response...`);
    
    res.json({
      success: true,
      message: `${leaveDays} leave day${leaveDays > 1 ? "s" : ""} successfully converted from extra hours!`,
      data: {
        leaveRecord: {
          _id: leaveRecord._id,
          userId: leaveRecord.userId,
          loginTime: leaveRecord.loginTime,
          logoutTime: leaveRecord.logoutTime,
          totalTime: leaveRecord.totalTime,
          workingHoursPerDay: leaveRecord.workingHoursPerDay,
          extraHours: leaveRecord.extraHours,
          extraHoursInMinutes: leaveRecord.extraHoursInMinutes,
          isLeaveDay: leaveRecord.isLeaveDay,
          leaveType: leaveRecord.leaveType,
          remarks: leaveRecord.remarks,
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
    
    console.log(`✅ Response sent successfully`);

  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:");
    console.error("   - Error message:", error.message);
    console.error("   - Error stack:", error.stack);
    
    try {
      if (transactionInProgress) {
        console.log("🔄 Attempting to abort transaction...");
        await session.abortTransaction();
        console.log("✅ Transaction aborted successfully");
      }
    } catch (abortError) {
      console.error("❌ Failed to abort transaction:", abortError.message);
    } finally {
      console.log("🔚 Ending session...");
      session.endSession();
      console.log("✅ Session ended");
    }
    
    console.log("📤 Sending error response...");
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
    console.log("✅ Error response sent");
  }
});

// Record manual attendance - FIXED FOR 8 HOUR WORKDAY
router.post("/attendance/record", async (req, res) => {
  try {
    const { userId, loginTime, logoutTime, workingHoursPerDay } = req.body;

    if (!userId || !loginTime || !logoutTime) {
      return res.status(400).json({
        success: false,
        message: "User ID, login time, and logout time are required",
      });
    }

    // Parse dates
    const loginDateTime = new Date(loginTime);
    const logoutDateTime = new Date(logoutTime);

    // Validate that logout time is after login time
    if (logoutDateTime <= loginDateTime) {
      return res.status(400).json({
        success: false,
        message: "Logout time must be after login time",
      });
    }

    // Check if the date is Sunday or holiday
    const holidayCheck = await isHolidayOrSunday(loginDateTime);
    if (holidayCheck.isHoliday) {
      return res.status(400).json({
        success: false,
        message: `Cannot record attendance on ${holidayCheck.reason}`,
      });
    }

    // Check if attendance already exists for this user on the same day
    const loginDate = new Date(loginTime);
    loginDate.setUTCHours(0, 0, 0, 0);
    const nextDay = new Date(loginDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const existingAttendance = await Attendance.findOne({
      userId,
      loginTime: {
        $gte: loginDate,
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

    // Calculate time difference
    const diffMs = logoutDateTime - loginDateTime;

    // Calculate total time in HH:MM:SS format
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    const totalTime = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    // Calculate extra hours - FIXED FOR 8 HOUR WORKDAY
    const workingHours = workingHoursPerDay || 8; // Changed to 8 hours
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

    // Populate user details
    await attendance.populate("userId", "medicalRepName MRId");

    res.status(201).json({
      success: true,
      message: "Attendance recorded successfully",
      attendance,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    });
  }
});

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

export default router;
