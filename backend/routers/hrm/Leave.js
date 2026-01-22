import express from "express";
import mongoose from "mongoose";
import Attendance from "../../models/Hrm/Attendance.js";
import Leave from "../../models/Hrm/Leaves.js";

const router = express.Router();

// Helper function to format minutes to time string
const formatMinutesToTime = (minutes) => {
  if (minutes <= 0) return "00:00:00";
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
};

// Convert extra hours to leave
router.post('/convert-to-leave', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { userId, date, leaveDays, useMonthlyOnly = false } = req.body;

    if (!userId || !date || !leaveDays) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'User ID, date, and leave days are required'
      });
    }

    // Calculate required minutes (8 hours per day)
    const requiredMinutes = leaveDays * 8 * 60;

    // Build query for attendance records with extra hours
    let query = {
      userId,
      extraHoursInMinutes: { $gt: 0 },
      isLeaveDay: { $ne: true }
    };

    // If using monthly only, filter by current month
    if (useMonthlyOnly) {
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      query.loginTime = { $gte: startOfMonth, $lte: endOfMonth };
    }

    // Get all attendance records with extra hours, sorted by date (oldest first)
    const attendanceRecords = await Attendance.find(query)
      .sort({ loginTime: 1 })
      .session(session);

    if (!attendanceRecords || attendanceRecords.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'No extra hours available for conversion'
      });
    }

    // Calculate total available extra minutes
    const totalExtraMinutes = attendanceRecords.reduce((sum, record) => {
      return sum + (record.extraHoursInMinutes || 0);
    }, 0);

    if (totalExtraMinutes < requiredMinutes) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Insufficient extra hours. Available: ${Math.floor(totalExtraMinutes/60)}h ${totalExtraMinutes%60}m, Required: ${leaveDays * 8}h`
      });
    }

    // Process records to deduct extra hours
    let remainingRequiredMinutes = requiredMinutes;
    const updatedRecords = [];
    const deductionDetails = [];

    for (const record of attendanceRecords) {
      if (remainingRequiredMinutes <= 0) break;

      const availableMinutes = record.extraHoursInMinutes || 0;
      
      if (availableMinutes > 0) {
        // Calculate how many minutes to deduct from this record
        const minutesToDeduct = Math.min(availableMinutes, remainingRequiredMinutes);
        
        // Store original values for logging
        const originalMinutes = availableMinutes;
        const newMinutes = availableMinutes - minutesToDeduct;
        
        // Update the record
        record.extraHoursInMinutes = newMinutes;
        record.extraHours = formatMinutesToTime(newMinutes);
        record.updatedAt = new Date();
        
        await record.save({ session });
        updatedRecords.push(record);
        
        // Log the deduction
        deductionDetails.push({
          recordId: record._id,
          date: record.loginTime,
          originalMinutes,
          deductedMinutes: minutesToDeduct,
          remainingMinutes: newMinutes
        });
        
        // Reduce remaining required minutes
        remainingRequiredMinutes -= minutesToDeduct;
      }
    }

    // Create leave date with 09:00 AM timing
    const leaveDate = new Date(date);
    leaveDate.setUTCHours(9, 0, 0, 0);

    // Check if leave already exists for this date
    const existingLeave = await Attendance.findOne({
      userId,
      loginTime: {
        $gte: new Date(leaveDate.setUTCHours(0, 0, 0, 0)),
        $lt: new Date(leaveDate.setUTCHours(24, 0, 0, 0))
      },
      isLeaveDay: true
    }).session(session);

    if (existingLeave) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Leave already exists for this date'
      });
    }

    // Create leave attendance record
    const leaveAttendance = new Attendance({
      userId,
      loginTime: leaveDate,
      logoutTime: leaveDate,
      totalTime: "00:00:00",
      workingHoursPerDay: 8,
      extraHours: "00:00:00",
      extraHoursInMinutes: 0,
      isLeaveDay: true,
      leaveType: "extra_hours_converted",
      remarks: `Leave converted from ${leaveDays * 8} extra working hours (${leaveDays} day${leaveDays > 1 ? 's' : ''})`,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await leaveAttendance.save({ session });

    // Also create a record in the Leave collection
    const leaveRecord = new Leave({
      userId,
      leaveDate: leaveDate,
      reason: `Leave converted from ${leaveDays * 8} extra working hours`,
      leaveType: "extra_hours_converted",
      status: "approved",
      remarks: `Converted from extra hours on ${new Date().toISOString()}`
    });

    await leaveRecord.save({ session });

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Format response
    const responseData = {
      leaveAttendance: {
        _id: leaveAttendance._id,
        userId: leaveAttendance.userId,
        date: leaveAttendance.loginTime,
        isLeaveDay: leaveAttendance.isLeaveDay,
        leaveType: leaveAttendance.leaveType,
        remarks: leaveAttendance.remarks
      },
      deductions: deductionDetails.map(detail => ({
        recordId: detail.recordId,
        date: detail.date,
        originalHours: formatMinutesToTime(detail.originalMinutes),
        deductedHours: formatMinutesToTime(detail.deductedMinutes),
        remainingHours: formatMinutesToTime(detail.remainingMinutes)
      }))
    };

    res.json({
      success: true,
      message: `${leaveDays} leave day${leaveDays > 1 ? 's' : ''} successfully converted from extra hours`,
      data: responseData
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error converting extra hours to leave:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to convert extra hours: ' + error.message
    });
  }
});

// Get extra hours summary for a user - FIXED VERSION
router.get('/extra-hours/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const currentDate = new Date();
    const queryYear = year || currentDate.getFullYear();
    const queryMonth = month !== undefined ? parseInt(month) : currentDate.getMonth();

    // Get all attendance records for the user (excluding leave days)
    const allRecords = await Attendance.find({
      userId,
      isLeaveDay: { $ne: true }
    }).sort({ loginTime: 1 });

    // Get monthly records - FIXED: Include records that have ANY time in the month
    const startOfMonth = new Date(queryYear, queryMonth, 1);
    const endOfMonth = new Date(queryYear, queryMonth + 1, 0, 23, 59, 59, 999);
    
    const monthlyRecords = allRecords.filter(record => {
      const loginDate = new Date(record.loginTime);
      const logoutDate = new Date(record.logoutTime);
      
      // Check if the record overlaps with the month
      // Either login is in the month OR logout is in the month
      return (loginDate >= startOfMonth && loginDate <= endOfMonth) ||
             (logoutDate >= startOfMonth && logoutDate <= endOfMonth);
    });

    // Function to calculate extra hours from a record
    const calculateExtraHoursFromRecord = (record) => {
      // First try to use extraHoursInMinutes
      if (record.extraHoursInMinutes && record.extraHoursInMinutes > 0) {
        return record.extraHoursInMinutes / 60;
      }
      
      // Then try to use extraHours string
      if (record.extraHours && record.extraHours !== "00:00:00") {
        const timeParts = record.extraHours.split(':');
        if (timeParts.length === 3) {
          const hours = parseInt(timeParts[0]) || 0;
          const minutes = parseInt(timeParts[1]) || 0;
          const seconds = parseInt(timeParts[2]) || 0;
          return hours + (minutes / 60) + (seconds / 3600);
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
    
    allRecords.forEach(record => {
      const extraHours = calculateExtraHoursFromRecord(record);
      totalExtraHours += extraHours;
    });

    // Calculate monthly extra hours - include ALL extra hours from records in the month
    monthlyRecords.forEach(record => {
      const extraHours = calculateExtraHoursFromRecord(record);
      monthlyExtraHours += extraHours;
    });

    // Convert to minutes for leave day calculation
    const totalExtraMinutes = totalExtraHours * 60;
    const monthlyExtraMinutes = monthlyExtraHours * 60;
    
    const totalLeaveDaysAvailable = Math.floor(totalExtraMinutes / (8 * 60));
    const monthlyLeaveDaysAvailable = Math.floor(monthlyExtraMinutes / (8 * 60));
    
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
        monthlyRecordsCount: monthlyRecords.length
      }
    });

  } catch (error) {
    console.error('Error getting extra hours:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get extra hours: ' + error.message
    });
  }
});

// Get all attendance records for a user (for debugging)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    let query = { userId };
    
    if (startDate && endDate) {
      query.loginTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const records = await Attendance.find(query)
      .sort({ loginTime: 1 })
      .lean();

    // Format the response
    const formattedRecords = records.map(record => ({
      _id: record._id,
      userId: record.userId,
      loginTime: record.loginTime,
      logoutTime: record.logoutTime,
      totalTime: record.totalTime,
      workingHoursPerDay: record.workingHoursPerDay,
      extraHours: record.extraHours,
      extraHoursInMinutes: record.extraHoursInMinutes,
      isLeaveDay: record.isLeaveDay,
      leaveType: record.leaveType,
      remarks: record.remarks,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }));

    res.json({
      success: true,
      data: formattedRecords,
      count: formattedRecords.length
    });

  } catch (error) {
    console.error('Error getting user attendance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get attendance records: ' + error.message
    });
  }
});

export default router;