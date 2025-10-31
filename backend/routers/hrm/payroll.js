import express from "express";
import Payroll from "../../models/Hrm/Payroll.js";
const router = express.Router();

// @desc    Get all payrolls with pagination and search
// @route   GET /api/payrolls
router.get('/payrolls', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      department = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};

    if (search) {
      filter.$or = [
        { employeeName: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } }
      ];
    }

    if (department) {
      filter.department = { $regex: department, $options: 'i' };
    }

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const payrolls = await Payroll.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Get total count for pagination
    const total = await Payroll.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: payrolls,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// @desc    Get single payroll by ID
// @route   GET /api/payrolls/:id
router.get('/payrolls/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findById(id);

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll not found'
      });
    }

    res.status(200).json({
      success: true,
      data: payroll
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// @desc    Create new payroll
// @route   POST /api/payrolls
router.post('/payrolls', async (req, res) => {
  try {
    const {
      employeeName,
      department,
      designation,
      basicSalary,
      allowances,
      deductions,
      remarks
    } = req.body;

    // Validate required fields
    if (!employeeName || !department || !designation || !basicSalary) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: employeeName, department, designation, basicSalary'
      });
    }

    // Validate numeric fields
    if (isNaN(basicSalary) || basicSalary < 0) {
      return res.status(400).json({
        success: false,
        message: 'Basic salary must be a valid positive number'
      });
    }

    if (allowances && (isNaN(allowances) || allowances < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Allowances must be a valid positive number'
      });
    }

    if (deductions && (isNaN(deductions) || deductions < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Deductions must be a valid positive number'
      });
    }

    // Calculate net salary
    const netSalary = parseFloat(basicSalary) + parseFloat(allowances || 0) - parseFloat(deductions || 0);

    // Validate net salary
    if (netSalary < 0) {
      return res.status(400).json({
        success: false,
        message: 'Net salary cannot be negative'
      });
    }

    // Create payroll
    const payroll = new Payroll({
      employeeName,
      department,
      designation,
      basicSalary: parseFloat(basicSalary),
      allowances: parseFloat(allowances || 0),
      deductions: parseFloat(deductions || 0),
      netSalary,
      remarks: remarks || ''
    });

    const savedPayroll = await payroll.save();

    res.status(201).json({
      success: true,
      message: 'Payroll created successfully',
      data: savedPayroll
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// @desc    Update payroll
// @route   PUT /api/payrolls/:id
router.put('/payrolls/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Check if payroll exists
    const existingPayroll = await Payroll.findById(id);
    if (!existingPayroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll not found'
      });
    }

    // Validate numeric fields if provided
    if (updateData.basicSalary && (isNaN(updateData.basicSalary) || updateData.basicSalary < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Basic salary must be a valid positive number'
      });
    }

    if (updateData.allowances && (isNaN(updateData.allowances) || updateData.allowances < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Allowances must be a valid positive number'
      });
    }

    if (updateData.deductions && (isNaN(updateData.deductions) || updateData.deductions < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Deductions must be a valid positive number'
      });
    }

    // Calculate net salary if salary components are updated
    if (updateData.basicSalary || updateData.allowances || updateData.deductions) {
      const basicSalary = updateData.basicSalary !== undefined ? parseFloat(updateData.basicSalary) : existingPayroll.basicSalary;
      const allowances = updateData.allowances !== undefined ? parseFloat(updateData.allowances) : existingPayroll.allowances;
      const deductions = updateData.deductions !== undefined ? parseFloat(updateData.deductions) : existingPayroll.deductions;
      
      const netSalary = basicSalary + allowances - deductions;
      
      if (netSalary < 0) {
        return res.status(400).json({
          success: false,
          message: 'Net salary cannot be negative'
        });
      }
      
      updateData.netSalary = netSalary;
    }

    const updatedPayroll = await Payroll.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Payroll updated successfully',
      data: updatedPayroll
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// @desc    Delete payroll
// @route   DELETE /api/payrolls/:id
router.delete('/payrolls/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findByIdAndDelete(id);

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payroll deleted successfully',
      data: { id }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// @desc    Bulk delete payrolls
// @route   DELETE /api/payrolls
router.delete('/payrolls', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of payroll IDs to delete'
      });
    }

    const result = await Payroll.deleteMany({ _id: { $in: ids } });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payrolls found to delete'
      });
    }

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} payroll(s) deleted successfully`,
      data: { deletedCount: result.deletedCount }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

// @desc    Get payroll statistics
// @route   GET /api/payrolls/stats
router.get('/payrolls/stats', async (req, res) => {
  try {
    const stats = await Payroll.aggregate([
      {
        $group: {
          _id: null,
          totalPayrolls: { $sum: 1 },
          totalNetSalary: { $sum: '$netSalary' },
          totalBasicSalary: { $sum: '$basicSalary' },
          totalAllowances: { $sum: '$allowances' },
          totalDeductions: { $sum: '$deductions' },
          averageNetSalary: { $avg: '$netSalary' },
          byDepartment: {
            $push: {
              department: '$department',
              amount: '$netSalary'
            }
          }
        }
      },
      {
        $project: {
          totalPayrolls: 1,
          totalNetSalary: 1,
          totalBasicSalary: 1,
          totalAllowances: 1,
          totalDeductions: 1,
          averageNetSalary: 1,
          departmentBreakdown: {
            $arrayToObject: {
              $map: {
                input: '$byDepartment',
                as: 'item',
                in: {
                  k: '$$item.department',
                  v: {
                    $reduce: {
                      input: '$byDepartment',
                      initialValue: 0,
                      in: {
                        $cond: [
                          { $eq: ['$$item.department', '$$this.department'] },
                          { $add: ['$$value', '$$this.amount'] },
                          '$$value'
                        ]
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalPayrolls: 0,
      totalNetSalary: 0,
      totalBasicSalary: 0,
      totalAllowances: 0,
      totalDeductions: 0,
      averageNetSalary: 0,
      departmentBreakdown: {}
    };

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
});

export default router;