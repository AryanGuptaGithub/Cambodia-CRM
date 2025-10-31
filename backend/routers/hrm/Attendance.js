
import express from "express";
import Attendance from "../../models/Hrm/Attendance.js";
const router = express.Router();

router.post('/attendance/login', async (req, res) => {
  try {
    const { userId, loginTime } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const attendance = new Attendance({
      userId,
      loginTime: loginTime || new Date()
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