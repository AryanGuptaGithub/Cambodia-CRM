import express from "express";
import Payroll from "../../models/Hrm/Payroll.js";
import Staff from "../../models/staffMember/staff.js"; 
import mongoose from "mongoose";

const router = express.Router();

const generateNextPayrollCode = async () => {
  const latestPayroll = await Payroll.findOne({}).sort({ createdAt: -1 });
  let nextNumber = 1;
  
  if (latestPayroll && latestPayroll.payrollCode) {
    const matches = latestPayroll.payrollCode.match(/PR-(\d+)/);
    if (matches && matches[1]) {
      nextNumber = parseInt(matches[1]) + 1;
    }
  }
  
  return `PR-${nextNumber.toString().padStart(4, '0')}`;
};

router.get("/payrolls", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      period = "",
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build match conditions for filtering
    const matchConditions = {};

    // Status filter
    if (status && status !== "all") {
      matchConditions.status = status;
    }

    // Period filter
    if (period) {
      matchConditions.period = period;
    }

    // Search filter
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchConditions.$or = [
        { payrollCode: searchRegex },
        { employeeName: searchRegex },
        { designation: searchRegex },
        { department: searchRegex },
        { paymentMethod: searchRegex }
      ];
    }

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get payrolls with population
    const payrolls = await Payroll.find(matchConditions)
      .populate("employeeId", "employeeName designation department")
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const total = await Payroll.countDocuments(matchConditions);

    // Get next payroll code
    const nextPayrollCode = await generateNextPayrollCode();

    res.status(200).json({
      success: true,
      data: payrolls,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum
      },
      nextPayrollCode
    });
  } catch (error) {
    console.error("❌ Error fetching payrolls:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payrolls",
      error: error.message
    });
  }
});

// ==================== GET SINGLE PAYROLL BY ID ====================
router.get("/payrolls/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findById(id)
      .populate("employeeId", "employeeName designation department phone email")
      .populate("createdBy", "name email");

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll not found"
      });
    }

    res.status(200).json({
      success: true,
      data: payroll
    });
  } catch (error) {
    console.error("❌ Error fetching payroll:", error);
    
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid payroll ID"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch payroll",
      error: error.message
    });
  }
});

// ==================== CREATE NEW PAYROLL ====================
router.post("/payrolls", async (req, res) => {
  try {
    const {
      employeeId,
      period,
      basicSalary,
      allowances,
      deductions,
      status,
      paymentMethod,
      bankAccount,
      paymentDate,
      remarks
    } = req.body;

    // Validate required fields
    if (!employeeId || !period || !basicSalary) {
      return res.status(400).json({
        success: false,
        message: "Employee ID, period, and basic salary are required"
      });
    }

    // Validate period format (YYYY-MM)
    const periodRegex = /^\d{4}-\d{2}$/;
    if (!periodRegex.test(period)) {
      return res.status(400).json({
        success: false,
        message: "Period must be in YYYY-MM format"
      });
    }

    // Check if employee exists
    const employee = await Staff.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    // Check for duplicate payroll (same employee and period)
    const existingPayroll = await Payroll.findOne({
      employeeId,
      period
    });

    if (existingPayroll) {
      return res.status(409).json({
        success: false,
        message: "Payroll record already exists for this employee in the selected period"
      });
    }

    // Validate allowances array
    if (allowances && Array.isArray(allowances)) {
      for (let allowance of allowances) {
        if (!allowance.type || allowance.amount === undefined) {
          return res.status(400).json({
            success: false,
            message: "Each allowance must have type and amount"
          });
        }
        if (isNaN(parseFloat(allowance.amount)) || parseFloat(allowance.amount) < 0) {
          return res.status(400).json({
            success: false,
            message: "Allowance amount must be a valid non-negative number"
          });
        }
      }
    }

    // Create payroll object
    const payrollData = {
      employeeId,
      period,
      basicSalary: parseFloat(basicSalary),
      deductions: parseFloat(deductions) || 0,
      status: status || "pending",
      paymentMethod: paymentMethod || "bank",
      bankAccount: bankAccount || "",
      paymentDate: paymentDate || null,
      remarks: remarks || "",
      createdBy: req.user?._id // Assuming you have user authentication
    };

    // Add allowances if provided
    if (allowances && Array.isArray(allowances)) {
      payrollData.allowances = allowances.map(allowance => ({
        type: allowance.type.trim(),
        amount: parseFloat(allowance.amount)
      }));
    }

    // Create payroll
    const payroll = new Payroll(payrollData);
    await payroll.save();

    // Populate employee details in response
    await payroll.populate("employeeId", "employeeName designation department");

    res.status(201).json({
      success: true,
      message: "Payroll created successfully",
      data: payroll
    });

  } catch (error) {
    console.error("❌ Payroll creation error:", error);
    
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages
      });
    }
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Payroll record already exists for this period"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create payroll",
      error: error.message
    });
  }
});

// ==================== UPDATE PAYROLL ====================
router.put("/payrolls/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      basicSalary,
      allowances,
      deductions,
      status,
      paymentMethod,
      bankAccount,
      paymentDate,
      remarks,
      enabled
    } = req.body;

    // Find payroll
    const payroll = await Payroll.findById(id);
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll not found"
      });
    }

    // Update fields
    if (basicSalary !== undefined) payroll.basicSalary = parseFloat(basicSalary);
    if (deductions !== undefined) payroll.deductions = parseFloat(deductions);
    if (status) payroll.status = status;
    if (paymentMethod) payroll.paymentMethod = paymentMethod;
    if (bankAccount !== undefined) payroll.bankAccount = bankAccount;
    if (paymentDate !== undefined) payroll.paymentDate = paymentDate;
    if (remarks !== undefined) payroll.remarks = remarks;
    if (enabled !== undefined) payroll.enabled = enabled;

    // Update allowances if provided
    if (allowances && Array.isArray(allowances)) {
      payroll.allowances = allowances.map(allowance => ({
        type: allowance.type.trim(),
        amount: parseFloat(allowance.amount)
      }));
    }

    await payroll.save();
    await payroll.populate("employeeId", "employeeName designation department");

    res.status(200).json({
      success: true,
      message: "Payroll updated successfully",
      data: payroll
    });

  } catch (error) {
    console.error("❌ Error updating payroll:", error);
    
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages
      });
    }
    
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid payroll ID"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update payroll",
      error: error.message
    });
  }
});

// ==================== DELETE PAYROLL ====================
router.delete("/payrolls/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findById(id);
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll not found"
      });
    }

    await Payroll.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Payroll deleted successfully",
      data: { id }
    });

  } catch (error) {
    console.error("❌ Error deleting payroll:", error);
    
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid payroll ID"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to delete payroll",
      error: error.message
    });
  }
});

// ==================== BULK DELETE PAYROLLS ====================
router.delete("/payrolls", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Array of payroll IDs is required"
      });
    }

    // Validate IDs
    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length) {
      return res.status(400).json({
        success: false,
        message: "Some payroll IDs are invalid"
      });
    }

    const result = await Payroll.deleteMany({ _id: { $in: validIds } });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No payrolls found to delete"
      });
    }

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} payroll(s) deleted successfully`,
      data: { deletedCount: result.deletedCount }
    });

  } catch (error) {
    console.error("❌ Error deleting multiple payrolls:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete payrolls",
      error: error.message
    });
  }
});

// ==================== IMPORT PAYROLLS FROM EXCEL/CSV ====================
router.post("/payrolls/import", async (req, res) => {
  try {
    const payrollData = req.body;

    if (!Array.isArray(payrollData) || payrollData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Payroll data array is required"
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Process each payroll record
    for (let [index, data] of payrollData.entries()) {
      try {
        // Validate required fields
        if (!data.employeeId || !data.period || !data.basicSalary) {
          results.failed++;
          results.errors.push(`Row ${index + 1}: Missing required fields`);
          continue;
        }

        // Check if employee exists
        const employee = await Staff.findById(data.employeeId);
        if (!employee) {
          results.failed++;
          results.errors.push(`Row ${index + 1}: Employee not found`);
          continue;
        }

        // Check for duplicate
        const existingPayroll = await Payroll.findOne({
          employeeId: data.employeeId,
          period: data.period
        });

        if (existingPayroll) {
          results.failed++;
          results.errors.push(`Row ${index + 1}: Payroll already exists for this period`);
          continue;
        }

        // Create payroll
        const payroll = new Payroll({
          employeeId: data.employeeId,
          period: data.period,
          basicSalary: parseFloat(data.basicSalary) || 0,
          deductions: parseFloat(data.deductions) || 0,
          status: data.status || "pending",
          paymentMethod: data.paymentMethod || "bank",
          bankAccount: data.bankAccount || "",
          paymentDate: data.paymentDate || null,
          remarks: data.remarks || "",
          createdBy: req.user?._id
        });

        await payroll.save();
        results.success++;

      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${index + 1}: ${error.message}`);
      }
    }

    res.status(200).json({
      success: true,
      message: `Import completed: ${results.success} successful, ${results.failed} failed`,
      results
    });

  } catch (error) {
    console.error("❌ Error importing payrolls:", error);
    res.status(500).json({
      success: false,
      message: "Failed to import payrolls",
      error: error.message
    });
  }
});

// ==================== GET PAYROLL STATISTICS ====================
router.get("/payrolls/stats", async (req, res) => {
  try {
    const stats = await Payroll.aggregate([
      {
        $group: {
          _id: null,
          totalPayrolls: { $sum: 1 },
          totalNetSalary: { $sum: "$netSalary" },
          totalBasicSalary: { $sum: "$basicSalary" },
          totalAllowances: { $sum: "$totalAllowance" },
          totalDeductions: { $sum: "$deductions" },
          averageNetSalary: { $avg: "$netSalary" },
          byDepartment: {
            $push: {
              department: "$department",
              amount: "$netSalary"
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
                input: "$byDepartment",
                as: "item",
                in: {
                  k: "$$item.department",
                  v: {
                    $reduce: {
                      input: "$byDepartment",
                      initialValue: 0,
                      in: {
                        $cond: [
                          { $eq: ["$$item.department", "$$this.department"] },
                          { $add: ["$$value", "$$this.amount"] },
                          "$$value"
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
    console.error("❌ Error fetching payroll statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payroll statistics",
      error: error.message
    });
  }
});

export default router;