import express from 'express';
import Holiday from '../../models/Hrm/Holidays.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();


router.get('/holidays', async (req, res) => {
  try {
    // Fetch all holidays sorted by date
    const holidays = await Holiday.find()
      .sort({ holidayDate: 1 })
      .select('holidayCode holidayName holidayDate')
      .lean();

    // Generate next holiday code
    const latestHoliday = await Holiday.findOne()
      .sort({ holidayCode: -1 })
      .select('holidayCode')
      .lean();

    let nextHolidayCode = 'HLD001'; // Default starting code
    
    if (latestHoliday && latestHoliday.holidayCode) {
      // Extract number from code (e.g., "HLD001" -> 1)
      const codeNumber = parseInt(latestHoliday.holidayCode.replace(/\D/g, '')) || 0;
      nextHolidayCode = `HLD${(codeNumber + 1).toString().padStart(3, '0')}`;
    }

    res.json({
      success: true,
      holidays,
      nextHolidayCode
    });

  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching holidays'
    });
  }
});


router.post('/holidays', [
  body('holidayName').notEmpty().withMessage('Holiday name is required'),
  body('holidayDate').isISO8601().withMessage('Valid holiday date is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { holidayName, holidayDate, holidayCode } = req.body;

    // Check if holiday already exists on the same date
    const existingHoliday = await Holiday.findOne({ 
      holidayDate: new Date(holidayDate) 
    });

    if (existingHoliday) {
      return res.status(400).json({
        success: false,
        message: 'Holiday already exists on this date'
      });
    }

    // Create new holiday
    const holiday = new Holiday({
      holidayCode: holidayCode || await generateHolidayCode(),
      holidayName,
      holidayDate: new Date(holidayDate)
    });

    await holiday.save();

    res.status(201).json({
      success: true,
      message: 'Holiday created successfully',
      holiday
    });

  } catch (error) {
    console.error('Error creating holiday:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating holiday'
    });
  }
});

// Helper function to generate holiday code
async function generateHolidayCode() {
  const latestHoliday = await Holiday.findOne()
    .sort({ holidayCode: -1 })
    .select('holidayCode')
    .lean();

  if (!latestHoliday) {
    return 'HLD001';
  }

  const codeNumber = parseInt(latestHoliday.holidayCode.replace(/\D/g, '')) || 0;
  return `HLD${(codeNumber + 1).toString().padStart(3, '0')}`;
}

export default router;