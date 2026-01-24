import express from "express";
import MRBasicPayroll from '../../models/Hrm/MRBasicPayroll.js';
import MR from '../../models/staffMember/staff.js'; 
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Validation middleware
const validateMRBasicPayroll = [
  body('employeeId').notEmpty().withMessage('Employee ID is required'),
  body('basicSalary').isFloat({ min: 0 }).withMessage('Basic salary must be a positive number'),
  body('effectiveFrom').isISO8601().withMessage('Effective from date must be in ISO format (YYYY-MM-DD)'),
  body('remarks').optional().isString()
];

// Helper function to get basic salary for period
const getBasicSalaryForPeriod = (payroll, period) => {
  if (!payroll || !payroll.salaryHistory || payroll.salaryHistory.length === 0) {
    return 0;
  }
  
  const targetDate = new Date(period + '-01');
  const activeSalary = payroll.salaryHistory.find(entry => {
    const effectiveFrom = new Date(entry.effectiveFrom);
    const effectiveUntil = entry.effectiveUntil ? new Date(entry.effectiveUntil) : null;
    
    return effectiveFrom <= targetDate && 
           (effectiveUntil === null || effectiveUntil >= targetDate);
  });
  
  return activeSalary ? activeSalary.basicSalary : payroll.currentBasicSalary || 0;
};

// GET all MRs for dropdown/selection - EXCLUDE MRs that already have payroll
// Fixed endpoint: using employeeId from payroll which should match _id from MR
router.get('/mrs/available', async (req, res) => {
  try {
    // Get all existing payroll records and extract employee IDs
    const existingPayrolls = await MRBasicPayroll.find({})
      .select('employeeId')
      .lean();
    
    const payrollEmployeeIds = existingPayrolls.map(p => p.employeeId.toString());
    
    // Get all MRs from MR collection
    const allMrs = await MR.find({})
      .select('_id medicalRepName teamName contactNo email MRId')
      .sort({ medicalRepName: 1 })
      .lean();
    
    // Filter out MRs that already have payroll records
    const availableMrs = allMrs.filter(mr => 
      !payrollEmployeeIds.includes(mr._id.toString())
    );
    
    res.status(200).json({
      success: true,
      count: availableMrs.length,
      data: availableMrs,
      message: availableMrs.length === 0 ? 'No available MRs without payroll records' : 'Available MRs fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching available MR list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch MR list',
      error: error.message
    });
  }
});

// GET all MRs (for reference, not filtered)
router.get('/mrs/all', async (req, res) => {
  try {
    const allMrs = await MR.find({})
      .select('_id medicalRepName teamName contactNo email MRId')
      .sort({ medicalRepName: 1 })
      .lean();
    
    res.status(200).json({
      success: true,
      count: allMrs.length,
      data: allMrs
    });
  } catch (error) {
    console.error('Error fetching all MR list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch MR list',
      error: error.message
    });
  }
});

// GET all MR Basic Payrolls with pagination and search
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100, search = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const query = {};
    
    // Search functionality
    if (search) {
      query.$or = [
        { employeeId: { $regex: search, $options: 'i' } },
        { employeeName: { $regex: search, $options: 'i' } },
        { remarks: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Sorting
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Pagination
    const skip = (page - 1) * limit;
    
    // Get payrolls with populated MR details
    const payrolls = await MRBasicPayroll.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Try to populate MR details for each payroll
    const payrollsWithDetails = await Promise.all(payrolls.map(async (payroll) => {
      try {
        const mrDetails = await MR.findById(payroll.employeeId)
          .select('_id medicalRepName teamName contactNo email MRId')
          .lean();
        
        return {
          ...payroll,
          mrDetails: mrDetails || null,
          employeeName: mrDetails ? mrDetails.medicalRepName : payroll.employeeName,
          currentBasicSalary: payroll.currentBasicSalary,
          currentEffectiveFrom: payroll.currentEffectiveFrom,
          salaryHistoryCount: payroll.salaryHistory ? payroll.salaryHistory.length : 0
        };
      } catch (err) {
        return {
          ...payroll,
          mrDetails: null,
          salaryHistoryCount: payroll.salaryHistory ? payroll.salaryHistory.length : 0
        };
      }
    }));
    
    const total = await MRBasicPayroll.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: payrollsWithDetails,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching MR basic payrolls:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch MR basic payrolls',
      error: error.message
    });
  }
});

// GET single MR Basic Payroll by ID with salary history
router.get('/:id', async (req, res) => {
  try {
    const payroll = await MRBasicPayroll.findById(req.params.id);
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'MR Basic Payroll not found'
      });
    }
    
    // Try to fetch MR details
    let mrDetails = null;
    try {
      mrDetails = await MR.findById(payroll.employeeId)
        .select('_id medicalRepName teamName contactNo email MRId');
    } catch (err) {
      console.log('Could not fetch MR details:', err.message);
    }
    
    // Sort salary history by effectiveFrom descending (newest first)
    const sortedHistory = payroll.salaryHistory.sort((a, b) => 
      new Date(b.effectiveFrom) - new Date(a.effectiveFrom)
    );
    
    const responseData = {
      ...payroll.toObject(),
      mrDetails: mrDetails,
      salaryHistory: sortedHistory
    };
    
    res.status(200).json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error fetching MR basic payroll:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch MR basic payroll',
      error: error.message
    });
  }
});

// GET basic salary for specific period
router.get('/:employeeId/salary/:period', async (req, res) => {
  try {
    const { employeeId, period } = req.params;
    
    const payroll = await MRBasicPayroll.findOne({ employeeId });
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'MR Basic Payroll not found for this employee'
      });
    }
    
    const basicSalary = getBasicSalaryForPeriod(payroll, period);
    
    res.status(200).json({
      success: true,
      data: {
        employeeId,
        period,
        basicSalary,
        salaryHistory: payroll.salaryHistory
      }
    });
  } catch (error) {
    console.error('Error fetching salary for period:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salary for period',
      error: error.message
    });
  }
});

// POST create new MR Basic Payroll (with initial salary history)
router.post('/', validateMRBasicPayroll, async (req, res) => {
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
    
    // Verify that the employeeId exists in MR collection
    const mrExists = await MR.findById(req.body.employeeId);
    if (!mrExists) {
      return res.status(400).json({
        success: false,
        message: 'MR not found with the provided employee ID'
      });
    }
    
    // Check if payroll already exists for same employee
    const existingPayroll = await MRBasicPayroll.findOne({
      employeeId: req.body.employeeId
    });
    
    if (existingPayroll) {
      return res.status(409).json({
        success: false,
        message: 'Payroll already exists for this employee'
      });
    }
    
    const effectiveFrom = new Date(req.body.effectiveFrom);
    const basicSalary = parseFloat(req.body.basicSalary) || 0;
    
    // Get employee name from MR document
    const employeeName = mrExists.medicalRepName || mrExists.employeeName || mrExists.name || "";
    
    const payrollData = {
      employeeId: req.body.employeeId,
      employeeName: employeeName,
      currentBasicSalary: basicSalary,
      currentEffectiveFrom: effectiveFrom,
      remarks: req.body.remarks || '',
      salaryHistory: [{
        basicSalary: basicSalary,
        effectiveFrom: effectiveFrom,
        effectiveUntil: null, // This is the current active salary
        remarks: req.body.remarks || 'Initial salary'
      }]
    };
    
    const payroll = new MRBasicPayroll(payrollData);
    await payroll.save();
    
    res.status(201).json({
      success: true,
      message: 'MR Basic Payroll created successfully',
      data: payroll
    });
  } catch (error) {
    console.error('Error creating MR basic payroll:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create MR basic payroll',
      error: error.message
    });
  }
});

// PUT update MR Basic Payroll (add new salary entry)
router.put('/:id', [
  body('basicSalary').isFloat({ min: 0 }).withMessage('Basic salary must be a positive number'),
  body('effectiveFrom').isISO8601().withMessage('Effective from date must be in ISO format'),
  body('remarks').optional().isString()
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
    
    const payroll = await MRBasicPayroll.findById(req.params.id);
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'MR Basic Payroll not found'
      });
    }
    
    const basicSalary = parseFloat(req.body.basicSalary) || 0;
    const effectiveFrom = new Date(req.body.effectiveFrom);
    const remarks = req.body.remarks || '';
    
    // Check if effective date is in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (effectiveFrom < today) {
      return res.status(400).json({
        success: false,
        message: 'Effective date cannot be in the past for salary updates'
      });
    }
    
    // Use the schema method to add new salary entry
    await payroll.addSalaryEntry(basicSalary, effectiveFrom, remarks);
    
    // Update remarks if provided
    if (req.body.remarks !== undefined) {
      payroll.remarks = req.body.remarks;
    }
    
    await payroll.save();
    
    res.status(200).json({
      success: true,
      message: 'MR Basic Payroll updated successfully with new salary entry',
      data: payroll
    });
  } catch (error) {
    console.error('Error updating MR basic payroll:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update MR basic payroll',
      error: error.message
    });
  }
});

// PATCH update only remarks (without changing salary)
router.patch('/:id/remarks', async (req, res) => {
  try {
    const { remarks } = req.body;
    
    if (!remarks) {
      return res.status(400).json({
        success: false,
        message: 'Remarks is required'
      });
    }
    
    const payroll = await MRBasicPayroll.findByIdAndUpdate(
      req.params.id,
      { remarks },
      { new: true }
    );
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'MR Basic Payroll not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Remarks updated successfully',
      data: payroll
    });
  } catch (error) {
    console.error('Error updating remarks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update remarks',
      error: error.message
    });
  }
});

// DELETE single MR Basic Payroll
router.delete('/:id', async (req, res) => {
  try {
    const payroll = await MRBasicPayroll.findByIdAndDelete(req.params.id);
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'MR Basic Payroll not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'MR Basic Payroll deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting MR basic payroll:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete MR basic payroll',
      error: error.message
    });
  }
});

// DELETE bulk MR Basic Payrolls
router.delete('/', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of payroll IDs to delete'
      });
    }
    
    const result = await MRBasicPayroll.deleteMany({ _id: { $in: ids } });
    
    res.status(200).json({
      success: true,
      message: `${result.deletedCount} MR Basic Payroll(s) deleted successfully`
    });
  } catch (error) {
    console.error('Error bulk deleting MR basic payrolls:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete MR basic payrolls',
      error: error.message
    });
  }
});

// GET salary history for an employee
router.get('/:employeeId/history', async (req, res) => {
  try {
    const payroll = await MRBasicPayroll.findOne({ 
      employeeId: req.params.employeeId 
    });
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'MR Basic Payroll not found'
      });
    }
    
    // Sort history by effectiveFrom descending (newest first)
    const sortedHistory = payroll.salaryHistory.sort((a, b) => 
      new Date(b.effectiveFrom) - new Date(a.effectiveFrom)
    );
    
    res.status(200).json({
      success: true,
      data: {
        employeeId: payroll.employeeId,
        employeeName: payroll.employeeName,
        currentBasicSalary: payroll.currentBasicSalary,
        currentEffectiveFrom: payroll.currentEffectiveFrom,
        salaryHistory: sortedHistory
      }
    });
  } catch (error) {
    console.error('Error fetching salary history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salary history',
      error: error.message
    });
  }
});

// POST add new salary entry to existing payroll
router.post('/:id/salary', [
  body('basicSalary').isFloat({ min: 0 }).withMessage('Basic salary must be a positive number'),
  body('effectiveFrom').isISO8601().withMessage('Effective from date must be in ISO format'),
  body('remarks').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const payroll = await MRBasicPayroll.findById(req.params.id);
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'MR Basic Payroll not found'
      });
    }
    
    const basicSalary = parseFloat(req.body.basicSalary) || 0;
    const effectiveFrom = new Date(req.body.effectiveFrom);
    const remarks = req.body.remarks || '';
    
    // Validate effective date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (effectiveFrom < today) {
      return res.status(400).json({
        success: false,
        message: 'Effective date cannot be in the past for new salary entries'
      });
    }
    
    // Check if effective date is after current effective date
    if (effectiveFrom <= payroll.currentEffectiveFrom) {
      return res.status(400).json({
        success: false,
        message: 'New effective date must be after the current effective date'
      });
    }
    
    // Add new salary entry
    await payroll.addSalaryEntry(basicSalary, effectiveFrom, remarks);
    
    res.status(200).json({
      success: true,
      message: 'New salary entry added successfully',
      data: payroll
    });
  } catch (error) {
    console.error('Error adding salary entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add salary entry',
      error: error.message
    });
  }
});

export default router;