import express from "express";
import Attendance from "../../models/Hrm/Attendance.js";
import Holiday from "../../models/Hrm/Holidays.js";

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
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(checkDate);
  endOfDay.setHours(23, 59, 59, 999);

  const holiday = await Holiday.findOne({
    date: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  });

  if (holiday) {
    return { isHoliday: true, reason: holiday.name };
  }

  return { isHoliday: false, reason: null };
};

// NEW: Calculate extra hours and convert to leave days - UPDATED TO CALCULATE CORRECTLY
const calculateExtraHoursSummary = async (userId) => {
  try {
    // Get all attendance records for the user that have extra hours
    const attendanceRecords = await Attendance.find({ 
      userId,
      logoutTime: { $exists: true },
      extraHoursInMinutes: { $gt: 0 }
    }).sort({ loginTime: -1 });

    let totalExtraMinutes = 0;
    const recordsWithExtraHours = [];

    attendanceRecords.forEach(record => {
      if (record.extraHoursInMinutes && record.extraHoursInMinutes > 0) {
        totalExtraMinutes += record.extraHoursInMinutes;
        recordsWithExtraHours.push({
          id: record._id,
          date: record.loginTime,
          extraHours: record.extraHours,
          extraHoursInMinutes: record.extraHoursInMinutes,
          totalTime: record.totalTime
        });
      }
    });

    // Calculate leave days (9 hours = 540 minutes = 1 leave day)
    const totalExtraHours = totalExtraMinutes / 60;
    const leaveDaysAvailable = Math.floor(totalExtraMinutes / 540); // 9 hours in minutes
    const remainingMinutes = totalExtraMinutes % 540;

    return {
      totalExtraHours: parseFloat(totalExtraHours.toFixed(2)),
      totalExtraMinutes,
      leaveDaysAvailable,
      remainingMinutes,
      recordsWithExtraHours,
      totalRecords: recordsWithExtraHours.length
    };
  } catch (error) {
    console.error("Error calculating extra hours:", error);
    return {
      totalExtraHours: 0,
      totalExtraMinutes: 0,
      leaveDaysAvailable: 0,
      remainingMinutes: 0,
      recordsWithExtraHours: [],
      totalRecords: 0
    };
  }
};

// NEW: Calculate monthly extra hours summary
const calculateMonthlyExtraHoursSummary = async (userId, year, month) => {
  try {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    // Get attendance records for specific month
    const attendanceRecords = await Attendance.find({ 
      userId,
      logoutTime: { $exists: true },
      loginTime: { $gte: startDate, $lte: endDate },
      extraHoursInMinutes: { $gt: 0 }
    }).sort({ loginTime: -1 });

    let monthlyExtraMinutes = 0;
    const monthlyRecordsWithExtraHours = [];

    attendanceRecords.forEach(record => {
      if (record.extraHoursInMinutes && record.extraHoursInMinutes > 0) {
        monthlyExtraMinutes += record.extraHoursInMinutes;
        monthlyRecordsWithExtraHours.push({
          id: record._id,
          date: record.loginTime,
          extraHours: record.extraHours,
          extraHoursInMinutes: record.extraHoursInMinutes,
          totalTime: record.totalTime
        });
      }
    });

    // Calculate monthly leave days (9 hours = 540 minutes = 1 leave day)
    const monthlyExtraHours = monthlyExtraMinutes / 60;
    const monthlyLeaveDaysAvailable = Math.floor(monthlyExtraMinutes / 540);
    const monthlyRemainingMinutes = monthlyExtraMinutes % 540;

    return {
      monthlyExtraHours: parseFloat(monthlyExtraHours.toFixed(2)),
      monthlyExtraMinutes,
      monthlyLeaveDaysAvailable,
      monthlyRemainingMinutes,
      monthlyRecordsWithExtraHours,
      monthlyTotalRecords: monthlyRecordsWithExtraHours.length
    };
  } catch (error) {
    console.error("Error calculating monthly extra hours:", error);
    return {
      monthlyExtraHours: 0,
      monthlyExtraMinutes: 0,
      monthlyLeaveDaysAvailable: 0,
      monthlyRemainingMinutes: 0,
      monthlyRecordsWithExtraHours: [],
      monthlyTotalRecords: 0
    };
  }
};

// NEW: Get extra hours summary for specific MR - UPDATED
router.get('/attendance/extra-hours/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query; // Optional: Get specific month data
    
    let summary;
    
    if (year && month !== undefined) {
      // Get monthly summary
      summary = await calculateMonthlyExtraHoursSummary(userId, parseInt(year), parseInt(month));
      
      // Also get total summary
      const totalSummary = await calculateExtraHoursSummary(userId);
      
      res.json({
        success: true,
        data: {
          ...summary,
          totalExtraHours: totalSummary.totalExtraHours,
          totalExtraMinutes: totalSummary.totalExtraMinutes,
          totalLeaveDaysAvailable: totalSummary.leaveDaysAvailable,
          totalRemainingMinutes: totalSummary.remainingMinutes,
          isMonthly: true
        }
      });
    } else {
      // Get total summary
      summary = await calculateExtraHoursSummary(userId);
      
      res.json({
        success: true,
        data: {
          ...summary,
          isMonthly: false
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// NEW: Convert extra hours to leave - UPDATED TO USE SPECIFIC MONTH
router.post('/attendance/convert-to-leave', async (req, res) => {
  try {
    const { userId, date, hoursToConvert, useMonthlyOnly = false } = req.body;

    if (!userId || !date) {
      return res.status(400).json({
        success: false,
        message: 'User ID and date are required'
      });
    }

    // Check if date is valid (not Sunday or holiday)
    const holidayCheck = await isHolidayOrSunday(date);
    if (holidayCheck.isHoliday) {
      return res.status(400).json({
        success: false,
        message: `Cannot take leave on ${holidayCheck.reason}`
      });
    }

    // Check if date is in the future
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot convert leave for past dates'
      });
    }

    // Get the month and year for monthly calculation
    const leaveMonth = selectedDate.getMonth();
    const leaveYear = selectedDate.getFullYear();
    
    // Get monthly extra hours if useMonthlyOnly is true
    let monthlySummary = null;
    if (useMonthlyOnly) {
      monthlySummary = await calculateMonthlyExtraHoursSummary(userId, leaveYear, leaveMonth);
      
      // Check if monthly extra hours are sufficient
      const minutesToConvert = hoursToConvert * 60 || 540; // Default: 9 hours
      if (monthlySummary.monthlyExtraMinutes < minutesToConvert) {
        return res.status(400).json({
          success: false,
          message: `Insufficient monthly extra hours. Available this month: ${monthlySummary.monthlyExtraHours.toFixed(2)} hours, Required: ${minutesToConvert/60} hours`
        });
      }
    }

    // Get total extra hours summary
    const totalSummary = await calculateExtraHoursSummary(userId);
    
    // Check if sufficient extra hours exist
    const minutesToConvert = hoursToConvert * 60 || 540; // Default: 9 hours
    if (totalSummary.totalExtraMinutes < minutesToConvert) {
      return res.status(400).json({
        success: false,
        message: `Insufficient extra hours. Available: ${totalSummary.totalExtraHours.toFixed(2)} hours, Required: ${minutesToConvert/60} hours`
      });
    }

    // Check if attendance already exists for this date
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(checkDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const existingAttendance = await Attendance.findOne({
      userId,
      loginTime: {
        $gte: checkDate,
        $lt: nextDay
      }
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Attendance/Leave already recorded for this date'
      });
    }

    // Create leave record
    const leaveDate = new Date(date);
    leaveDate.setHours(9, 0, 0, 0); // Set to 9 AM
    
    const leaveRecord = new Attendance({
      userId,
      loginTime: leaveDate,
      logoutTime: leaveDate, // Same time for leave
      totalTime: "00:00:00",
      isLeaveDay: true,
      leaveType: "extra_hours_converted",
      remarks: `Leave converted from ${minutesToConvert/60} extra working hours`
    });

    await leaveRecord.save();

    // Update the original attendance records to mark used extra hours
    // We'll deduct from the oldest extra hours records first
    let minutesRemaining = minutesToConvert;
    const updatedRecords = [];
    
    if (useMonthlyOnly && monthlySummary) {
      // Use only monthly records
      for (const record of monthlySummary.monthlyRecordsWithExtraHours) {
        if (minutesRemaining <= 0) break;
        
        const attendance = await Attendance.findById(record.id);
        if (attendance && attendance.extraHoursInMinutes > 0) {
          const deduction = Math.min(attendance.extraHoursInMinutes, minutesRemaining);
          attendance.extraHoursInMinutes -= deduction;
          
          // Recalculate extra hours string
          if (attendance.extraHoursInMinutes > 0) {
            const extraHours = Math.floor(attendance.extraHoursInMinutes / 60);
            const extraMins = attendance.extraHoursInMinutes % 60;
            attendance.extraHours = `${extraHours.toString().padStart(2, "0")}:${extraMins
              .toString()
              .padStart(2, "0")}:00`;
          } else {
            attendance.extraHours = "00:00:00";
          }
          
          await attendance.save();
          updatedRecords.push(attendance._id);
          minutesRemaining -= deduction;
        }
      }
    } else {
      // Use all records (oldest first)
      const allRecords = await Attendance.find({ 
        userId,
        extraHoursInMinutes: { $gt: 0 }
      }).sort({ loginTime: 1 }); // Oldest first
      
      for (const attendance of allRecords) {
        if (minutesRemaining <= 0) break;
        
        const deduction = Math.min(attendance.extraHoursInMinutes, minutesRemaining);
        attendance.extraHoursInMinutes -= deduction;
        
        // Recalculate extra hours string
        if (attendance.extraHoursInMinutes > 0) {
          const extraHours = Math.floor(attendance.extraHoursInMinutes / 60);
          const extraMins = attendance.extraHoursInMinutes % 60;
          attendance.extraHours = `${extraHours.toString().padStart(2, "0")}:${extraMins
            .toString()
            .padStart(2, "0")}:00`;
        } else {
          attendance.extraHours = "00:00:00";
        }
        
        await attendance.save();
        updatedRecords.push(attendance._id);
        minutesRemaining -= deduction;
      }
    }
    
    // Populate user details
    await leaveRecord.populate('userId', 'medicalRepName MRId');

    res.json({
      success: true,
      message: `${minutesToConvert/60} hours converted to 1 leave day successfully`,
      data: {
        leaveRecord,
        remainingExtraHours: (totalSummary.totalExtraMinutes - minutesToConvert) / 60,
        updatedRecordsCount: updatedRecords.length,
        usedMonthlyOnly: useMonthlyOnly
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Record login
router.post('/attendance/login', async (req, res) => {
  try {
    const { userId, loginTime } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const loginDate = new Date(loginTime || new Date());

    // Check if Sunday or holiday
    const holidayCheck = await isHolidayOrSunday(loginDate);
    if (holidayCheck.isHoliday) {
      return res.status(400).json({
        success: false,
        message: `Cannot record attendance on ${holidayCheck.reason}`
      });
    }

    const attendance = new Attendance({
      userId,
      loginTime: loginDate
    });

    await attendance.save();
    
    // Populate user details
    await attendance.populate('userId', 'medicalRepName MRId');

    res.status(201).json({
      success: true,
      message: 'Login recorded successfully',
      attendance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Record logout
router.put('/attendance/logout/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { logoutTime } = req.body;

    const attendance = await Attendance.findById(id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    if (attendance.logoutTime) {
      return res.status(400).json({
        success: false,
        message: 'Logout already recorded for this session'
      });
    }

    attendance.logoutTime = logoutTime || new Date();
    
    // Calculate total time if both login and logout times exist
    if (attendance.loginTime && attendance.logoutTime) {
      const loginTime = new Date(attendance.loginTime);
      const logoutTime = new Date(attendance.logoutTime);
      const diffMs = logoutTime - loginTime;
      
      // Calculate total time in HH:MM:SS format
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      attendance.totalTime = `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      
      // Calculate extra hours (if worked more than workingHoursPerDay)
      const totalMinutesWorked = Math.floor(diffMs / (1000 * 60));
      const expectedMinutes = attendance.workingHoursPerDay * 60;
      
      if (totalMinutesWorked > expectedMinutes) {
        const extraMinutes = totalMinutesWorked - expectedMinutes;
        attendance.extraHoursInMinutes = extraMinutes;
        const extraHours = Math.floor(extraMinutes / 60);
        const extraMins = extraMinutes % 60;
        attendance.extraHours = `${extraHours.toString().padStart(2, "0")}:${extraMins
          .toString()
          .padStart(2, "0")}:00`;
      } else {
        attendance.extraHoursInMinutes = 0;
        attendance.extraHours = "00:00:00";
      }
    }
    
    await attendance.save();
    
    // Populate user details
    await attendance.populate('userId', 'medicalRepName MRId');

    res.json({
      success: true,
      message: 'Logout recorded successfully',
      attendance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Record manual attendance
router.post('/attendance/record', async (req, res) => {
  try {
    const { userId, loginTime, logoutTime, workingHoursPerDay } = req.body;

    if (!userId || !loginTime || !logoutTime) {
      return res.status(400).json({
        success: false,
        message: 'User ID, login time, and logout time are required'
      });
    }

    // Validate that logout time is after login time
    const loginDateTime = new Date(loginTime);
    const logoutDateTime = new Date(logoutTime);
    
    if (logoutDateTime <= loginDateTime) {
      return res.status(400).json({
        success: false,
        message: 'Logout time must be after login time'
      });
    }

    // Check if the date is Sunday or holiday
    const holidayCheck = await isHolidayOrSunday(loginDateTime);
    if (holidayCheck.isHoliday) {
      return res.status(400).json({
        success: false,
        message: `Cannot record attendance on ${holidayCheck.reason}`
      });
    }

    // Check if attendance already exists for this user on the same day
    const loginDate = new Date(loginTime);
    loginDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(loginDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const existingAttendance = await Attendance.findOne({
      userId,
      loginTime: {
        $gte: loginDate,
        $lt: nextDay
      }
    });

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Attendance already recorded for this user on the selected date'
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

    // Calculate extra hours
    const workingHours = workingHoursPerDay || 9;
    const totalMinutesWorked = Math.floor(diffMs / (1000 * 60));
    const expectedMinutes = workingHours * 60;
    let extraHours = "00:00:00";
    let extraHoursInMinutes = 0;

    if (totalMinutesWorked > expectedMinutes) {
      const extraMinutes = totalMinutesWorked - expectedMinutes;
      extraHoursInMinutes = extraMinutes;
      const extraHoursValue = Math.floor(extraMinutes / 60);
      const extraMins = extraMinutes % 60;
      extraHours = `${extraHoursValue.toString().padStart(2, "0")}:${extraMins
        .toString()
        .padStart(2, "0")}:00`;
    }

    const attendance = new Attendance({
      userId,
      loginTime: loginDateTime,
      logoutTime: logoutDateTime,
      totalTime,
      workingHoursPerDay: workingHours,
      extraHours,
      extraHoursInMinutes
    });

    await attendance.save();
    
    // Populate user details
    await attendance.populate('userId', 'medicalRepName MRId');

    res.status(201).json({
      success: true,
      message: 'Attendance recorded successfully',
      attendance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Get all attendance records
router.get('/attendance', async (req, res) => {
  try {
    const attendanceRecords = await Attendance.find()
      .populate('userId', 'medicalRepName MRId')
      .sort({ loginTime: -1 });

    res.json(attendanceRecords);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Get attendance records by MR ID
router.get('/attendance/mr/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const attendanceRecords = await Attendance.find({ userId })
      .populate('userId', 'medicalRepName MRId')
      .sort({ loginTime: -1 });

    res.json({
      success: true,
      data: attendanceRecords
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Get all holidays
router.get('/holidays', async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.json({
      success: true,
      holidays
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Delete all attendance records
router.delete('/attendance', async (req, res) => {
  try {
    await Attendance.deleteMany({});
    
    res.json({
      success: true,
      message: 'All attendance records cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

export default router;