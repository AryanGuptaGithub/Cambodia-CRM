import express from "express";
import MRBasicPayroll from '../../models/Hrm/MRBasicPayroll.js';
import MR from '../../models/staffMember/staff.js'; 
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Validation middleware
const validateMRBasicPayroll = [
  body('employeeId').notEmpty().withMessage('Employee ID is required'),
  body('employeeName').notEmpty().withMessage('Employee name is required'),
  body('basicSalary').isFloat({ min: 0 }).withMessage('Basic salary must be a positive number'),
  body('remarks').optional().isString()
];

// GET all MRs for dropdown/selection - EXCLUDE MRs that already have payroll
router.get('/mrs/list', async (req, res) => {
  try {
    // Get all existing payroll records to know which MRs already have payroll
    const existingPayrolls = await MRBasicPayroll.find({})
      .select('employeeId employeeName')
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
    
    if (availableMrs.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'No available MRs without payroll records'
      });
    }
    
    res.status(200).json({
      success: true,
      data: availableMrs,
      totalAvailable: availableMrs.length,
      totalWithPayroll: payrollEmployeeIds.length
    });
  } catch (error) {
    console.error('Error fetching MR list:', error);
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
    
    // Populate employee details if available
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
          employeeId: mrDetails || payroll.employeeId,
          employeeName: mrDetails ? mrDetails.medicalRepName : payroll.employeeName
        };
      } catch (err) {
        return payroll;
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

// GET single MR Basic Payroll by ID
router.get('/:id', async (req, res) => {
  try {
    const payroll = await MRBasicPayroll.findById(req.params.id);
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'MR Basic Payroll not found'
      });
    }
    
    // Try to fetch MR details for better frontend display
    let mrDetails = null;
    try {
      mrDetails = await MR.findById(payroll.employeeId)
        .select('_id medicalRepName teamName contactNo email MRId');
    } catch (err) {
      console.log('Could not fetch MR details:', err.message);
    }
    
    const responseData = {
      ...payroll.toObject(),
      mrDetails: mrDetails
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

// POST create new MR Basic Payroll
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
      return res.status(400).json({
        success: false,
        message: 'Payroll already exists for this employee'
      });
    }
    
    const payrollData = {
      employeeId: req.body.employeeId,
      employeeName: req.body.employeeName,
      basicSalary: parseFloat(req.body.basicSalary) || 0,
      remarks: req.body.remarks || ''
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

// PUT update MR Basic Payroll
router.put('/:id', validateMRBasicPayroll, async (req, res) => {
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
    
    const payrollData = {
      employeeId: req.body.employeeId,
      employeeName: req.body.employeeName,
      basicSalary: parseFloat(req.body.basicSalary) || 0,
      remarks: req.body.remarks || ''
    };
    
    const payroll = await MRBasicPayroll.findByIdAndUpdate(
      req.params.id,
      payrollData,
      { new: true, runValidators: true }
    );
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'MR Basic Payroll not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'MR Basic Payroll updated successfully',
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

// POST import MR Basic Payrolls from Excel/CSV
router.post('/import', async (req, res) => {
  try {
    const { payrolls } = req.body;
    
    if (!payrolls || !Array.isArray(payrolls) || payrolls.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide payroll data to import'
      });
    }
    
    // Fetch all MRs from MR collection
    const mrList = await MR.find({})
      .select('_id medicalRepName teamName contactNo email MRId');
    
    if (!mrList || mrList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No MRs found in the system. Please add MRs first.',
        errors: ['No MRs available in the system']
      });
    }
    
    // Get existing payrolls to avoid duplicates
    const existingPayrolls = await MRBasicPayroll.find({})
      .select('employeeId')
      .lean();
    
    const existingEmployeeIds = new Set(existingPayrolls.map(p => p.employeeId.toString()));
    
    // Validate each payroll record
    const errors = [];
    const validPayrolls = [];
    
    for (let i = 0; i < payrolls.length; i++) {
      const payroll = payrolls[i];
      
      // Check for required fields
      const employeeName = payroll.medicalRepName || payroll.employeeName || payroll.name;
      if (!employeeName) {
        errors.push(`Row ${i + 1}: Missing required field (employeeName)`);
        continue;
      }
      
      // Find MR by name
      const searchName = employeeName.toString().trim();
      
      const foundMR = mrList.find(mr => 
        mr.medicalRepName && 
        mr.medicalRepName.toLowerCase() === searchName.toLowerCase()
      );
      
      if (!foundMR) {
        errors.push(`Row ${i + 1}: MR "${searchName}" not found in system`);
        continue;
      }
      
      // Check if payroll already exists for this employee
      if (existingEmployeeIds.has(foundMR._id.toString())) {
        errors.push(`Row ${i + 1}: Payroll already exists for ${searchName}`);
        continue;
      }
      
      // Parse basic salary - handle comma separated values
      let basicSalary = 0;
      if (payroll.basicSalary !== undefined) {
        const salaryStr = String(payroll.basicSalary).replace(/,/g, '');
        basicSalary = parseFloat(salaryStr) || 0;
      }
      
      validPayrolls.push({
        employeeId: foundMR._id.toString(),
        employeeName: foundMR.medicalRepName,
        basicSalary: basicSalary,
        remarks: payroll.remarks ? payroll.remarks.toString().trim() : ''
      });
    }
    
    if (errors.length > 0 && validPayrolls.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Import failed',
        errors: errors
      });
    }
    
    // Insert valid payrolls
    if (validPayrolls.length > 0) {
      const result = await MRBasicPayroll.insertMany(validPayrolls);
      
      res.status(200).json({
        success: true,
        message: `Successfully imported ${result.length} MR Basic Payroll(s)`,
        importedCount: result.length,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors : undefined
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'No valid payrolls to import',
        errors: errors
      });
    }
  } catch (error) {
    console.error('Error importing MR basic payrolls:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import MR basic payrolls',
      error: error.message
    });
  }
});

export default router;