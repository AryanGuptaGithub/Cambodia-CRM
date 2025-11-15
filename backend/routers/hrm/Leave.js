import express from "express";
import Leave from "../../models/Hrm/Leaves.js";

const router = express.Router();

// Create a new leave
router.post('/leaves', async (req, res) => {
  try {
    const { userId, leaveDate, reason, leaveType, status } = req.body;

    if (!userId || !leaveDate || !reason) {
      return res.status(400).json({
        success: false,
        message: 'User ID, leave date, and reason are required'
      });
    }

    // Check if leave already exists for this user on the same day
    const existingLeave = await Leave.findOne({
      userId,
      leaveDate: {
        $gte: new Date(new Date(leaveDate).setHours(0, 0, 0, 0)),
        $lt: new Date(new Date(leaveDate).setHours(23, 59, 59, 999))
      }
    });

    if (existingLeave) {
      return res.status(400).json({
        success: false,
        message: 'Leave already exists for this user on the selected date'
      });
    }

    const leave = new Leave({
      userId,
      leaveDate: new Date(leaveDate),
      reason,
      leaveType: leaveType || 'paid',
      status: status || 'approved'
    });

    await leave.save();
    
    // Populate user details
    await leave.populate('userId', 'medicalRepName MRId');

    res.status(201).json({
      success: true,
      message: 'Leave recorded successfully',
      leave
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Get all leaves
router.get('/leaves', async (req, res) => {
  try {
    const leaves = await Leave.find()
      .populate('userId', 'medicalRepName MRId')
      .sort({ leaveDate: -1 });

    res.json(leaves);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Get leaves by user ID
router.get('/leaves/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const leaves = await Leave.find({ userId })
      .populate('userId', 'medicalRepName MRId')
      .sort({ leaveDate: -1 });

    res.json(leaves);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Update leave status
router.put('/leaves/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, approvedBy } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status (approved/rejected) is required'
      });
    }

    const leave = await Leave.findById(id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave not found'
      });
    }

    leave.status = status;
    leave.approvedBy = approvedBy;
    leave.approvedAt = new Date();

    await leave.save();
    
    // Populate user details
    await leave.populate('userId', 'medicalRepName MRId');

    res.json({
      success: true,
      message: `Leave ${status} successfully`,
      leave
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// Delete a leave
router.delete('/leaves/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const leave = await Leave.findByIdAndDelete(id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave not found'
      });
    }

    res.json({
      success: true,
      message: 'Leave deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

export default router;