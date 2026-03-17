import express from 'express';
import mongoose from 'mongoose';
import MrAdvance from '../../models/Hrm/MrAdvance.js';
import Destination from '../../models/accounts/Destination.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

// Helper to deduct amount from source account (used inside transaction)
async function deductFromSource(sourceAccountId, amount, session) {
  const source = await Destination.findById(sourceAccountId).session(session);
  if (!source) throw new Error('Source account not found');
  if ((source.totalAmount || 0) < amount) {
    throw new Error(
      `Insufficient balance in source account. Available: $${source.totalAmount.toFixed(
        2
      )}, Required: $${amount.toFixed(2)}`
    );
  }
  source.totalAmount = (source.totalAmount || 0) - amount;
  await source.save({ session });
}

// Helper to add amount back when deleting an advance
async function addToSource(sourceAccountId, amount, session) {
  const source = await Destination.findById(sourceAccountId).session(session);
  if (!source) throw new Error('Source account not found');
  source.totalAmount = (source.totalAmount || 0) + amount;
  await source.save({ session });
}

// GET /api/hrm/mr-advance – list all advances with pagination and filters
router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10, startDate, endDate, year, employeeId } = req.query;
    const query = {};

    // Filter by employee if provided
    if (employeeId) {
      query.employeeId = employeeId;
    }

    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }

    // Year filter (if no date range, filter by year)
    if (year && !startDate && !endDate) {
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
      query.date = { $gte: startOfYear, $lte: endOfYear };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await MrAdvance.countDocuments(query);
    const advances = await MrAdvance.find(query)
      .populate('employeeId', 'medicalRepName name')
      .populate('sourceAccount', 'name')
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: advances,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching advances:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/hrm/mr-advance – create a new advance
router.post('/', protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { employeeId, date, sourceAccount, amount, remarks } = req.body;
    const createdBy = req.user.id;

    if (!employeeId || !sourceAccount || !amount || amount <= 0) {
      throw new Error('Missing required fields');
    }

    // Deduct amount from source account
    await deductFromSource(sourceAccount, amount, session);

    const advance = new MrAdvance({
      employeeId,
      date: date || new Date(),
      sourceAccount,
      amount,
      remarks,
      createdBy,
      status: 'pending',
    });

    await advance.save({ session });
    await session.commitTransaction();
    session.endSession();

    const populated = await MrAdvance.findById(advance._id)
      .populate('employeeId', 'medicalRepName name')
      .populate('sourceAccount', 'name totalAmount');

    res.status(201).json({
      success: true,
      data: populated,
      message: 'Advance recorded successfully',
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error creating advance:', error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// GET /api/hrm/mr-advance/:id – get single advance
router.get('/:id', protect, async (req, res) => {
  try {
    const advance = await MrAdvance.findById(req.params.id)
      .populate('employeeId', 'medicalRepName name')
      .populate('sourceAccount', 'name');
    if (!advance) {
      return res.status(404).json({ success: false, message: 'Advance not found' });
    }
    res.json({ success: true, data: advance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/hrm/mr-advance/:id – delete an advance and refund source account if pending
router.delete('/:id', protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const advance = await MrAdvance.findById(req.params.id).session(session);
    if (!advance) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Advance not found' });
    }

    // If status is pending, we need to add the amount back to source account
    if (advance.status === 'pending') {
      await addToSource(advance.sourceAccount, advance.amount, session);
    }

    await advance.deleteOne({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, message: 'Advance deleted successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error deleting advance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/hrm/mr-advance/employee/:employeeId – list advances for one MR (kept for backward compatibility)
router.get('/employee/:employeeId', protect, async (req, res) => {
  try {
    const advances = await MrAdvance.find({ employeeId: req.params.employeeId })
      .populate('sourceAccount', 'name')
      .sort({ date: -1 });
    res.json({ success: true, data: advances });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/hrm/mr-advance/total/:employeeId – total pending advance amount for an MR
router.get('/total/:employeeId', protect, async (req, res) => {
  try {
    const employeeObjectId = new mongoose.Types.ObjectId(req.params.employeeId);
    const result = await MrAdvance.aggregate([
      {
        $match: {
          employeeId: employeeObjectId,
          status: 'pending',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const total = result.length > 0 ? result[0].total : 0;
    res.json({ success: true, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;