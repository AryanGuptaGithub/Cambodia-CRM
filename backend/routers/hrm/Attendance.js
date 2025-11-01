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
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const hours = Math.floor(diffMins / 60);
      const minutes = diffMins % 60;
      attendance.totalTime = `${hours}h ${minutes}m`;
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

// Record manual attendance (both login and logout at once)
router.post('/attendance/record', async (req, res) => {
  try {
    const { userId, loginTime, logoutTime } = req.body;

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

    // Calculate total time
    const diffMs = logoutDateTime - loginDateTime;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;
    const totalTime = `${hours}h ${minutes}m`;

    const attendance = new Attendance({
      userId,
      loginTime: loginDateTime,
      logoutTime: logoutDateTime,
      totalTime
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

// Get all holidays
router.get('/holidays', async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.json(holidays);
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