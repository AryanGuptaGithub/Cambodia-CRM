import express from "express";
import Payroll from "../../models/Hrm/Payroll.js";
import Staff from "../../models/staffMember/staff.js";
import MrBasicPayroll from "../../models/Hrm/MRBasicPayroll.js"; 
import Account from "../../models/accounts/Destination.js";
import Attendance from "../../models/Hrm/Attendance.js";
import Leave from "../../models/Hrm/Leaves.js";
import mongoose from "mongoose";
import { Parser } from "json2csv";

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

  return `PR-${nextNumber.toString().padStart(4, "0")}`;
};

const updateAccountBalance = async (
  accountId,
  amount,
  operation = "subtract",
  session = null
) => {
  try {
    const account = await Account.findById(accountId).session(session);
    if (!account) {
      throw new Error(`Account with ID ${accountId} not found`);
    }

    if (operation === "subtract") {
      if (account.totalAmount < amount) {
        throw new Error(
          `Insufficient balance in account ${account.name}. Available: ${account.totalAmount}, Required: ${amount}`
        );
      }
      account.totalAmount -= amount;
    } else if (operation === "add") {
      account.totalAmount += amount;
    }

    await account.save({ session });
    return account;
  } catch (error) {
    throw error;
  }
};

const calculateExtraTimeAmount = (extraMinutes, perMinuteSalary) => {
  if (!extraMinutes || extraMinutes <= 0) return 0;
  return extraMinutes * perMinuteSalary;
};

const calculateSalaryForPeriod = async (employeeId, period, session = null) => {
  try {
    const employee = await Staff.findById(employeeId).session(session);
    if (!employee) {
      throw new Error("Employee not found in staff records");
    }

    const basicPayroll = await MrBasicPayroll.findOne({
      employeeId: employeeId
    }).session(session);

    if (!basicPayroll) {
      throw new Error("Basic payroll record not found for employee");
    }

    const basicSalary = basicPayroll.currentBasicSalary || 0;
    const basicSalaryNum = parseFloat(basicSalary);

    // Fixed: Always divide by 30 days
    const perDaySalary = basicSalaryNum / 30;
    const perMinuteSalary = perDaySalary / (8 * 60); // 8 working hours per day

    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    // Determine calculation end date
    let calculationEndDate;
    let isCurrentMonth = false;
    
    if (year === currentYear && month === currentMonth) {
      // Current month: calculate until today (include today)
      calculationEndDate = new Date(currentDate);
      calculationEndDate.setUTCHours(23, 59, 59, 999);
      isCurrentMonth = true;
    } else if (year < currentYear || (year === currentYear && month < currentMonth)) {
      // Past month: calculate full month
      calculationEndDate = endDate;
      isCurrentMonth = false;
    } else {
      // Future month: shouldn't happen, but handle it
      calculationEndDate = startDate;
      isCurrentMonth = false;
    }

    // Calculate total days in the period (from 1st to calculationEndDate)
    const totalDaysInPeriod = Math.floor((calculationEndDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    
    // Calculate working days in full month (for reference only)
    let totalWorkingDaysInMonth = 0;
    let currentDateIter = new Date(startDate);
    while (currentDateIter <= endDate) {
      const dayOfWeek = currentDateIter.getUTCDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        totalWorkingDaysInMonth++;
      }
      currentDateIter.setUTCDate(currentDateIter.getUTCDate() + 1);
    }

    // Calculate working days until calculation date
    let workingDaysUntilCalculation = 0;
    currentDateIter = new Date(startDate);
    while (currentDateIter <= calculationEndDate) {
      const dayOfWeek = currentDateIter.getUTCDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDaysUntilCalculation++;
      }
      currentDateIter.setUTCDate(currentDateIter.getUTCDate() + 1);
    }

    // Fetch attendance and leave records
    const attendanceRecords = await Attendance.find({
      userId: employeeId,
      loginTime: {
        $gte: startDate,
        $lte: calculationEndDate
      }
    }).session(session || null);

    const leaveRecords = await Leave.find({
      userId: employeeId,
      leaveDate: {
        $gte: startDate,
        $lte: calculationEndDate
      },
      status: 'approved'
    }).session(session || null);

    // Calculate leaves
    let totalLeaveDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let swapLeaveDays = 0;
    
    const leaveDatesSet = new Set();
    for (const leave of leaveRecords) {
      const leaveDate = new Date(leave.leaveDate);
      const dateStr = leaveDate.toISOString().split('T')[0];
      
      const dayOfWeek = leaveDate.getUTCDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        if (!leaveDatesSet.has(dateStr)) {
          leaveDatesSet.add(dateStr);
          totalLeaveDays++;
          
          if (leave.leaveType === 'unpaid') {
            unpaidLeaveDays++;
          } else if (leave.leaveType === 'paid') {
            paidLeaveDays++;
          } else if (leave.leaveType === 'swapleave') {
            swapLeaveDays++;
            paidLeaveDays++; // Swap leaves are paid
          } else if (leave.leaveType === 'holiday' || leave.leaveType === 'sunday') {
            paidLeaveDays++;
          }
        }
      }
    }

    // Calculate present days from attendance
    const presentDaysSet = new Set();
    attendanceRecords.forEach(record => {
      const dateStr = record.loginTime.toISOString().split('T')[0];
      presentDaysSet.add(dateStr);
    });
    const presentDays = presentDaysSet.size;

    // Calculate extra time
    let totalExtraMinutes = 0;
    const attendanceByDate = {};
    attendanceRecords.forEach(record => {
      const dateStr = record.loginTime.toISOString().split('T')[0];
      if (!attendanceByDate[dateStr]) {
        attendanceByDate[dateStr] = [];
      }
      attendanceByDate[dateStr].push(record);
    });

    Object.entries(attendanceByDate).forEach(([date, records]) => {
      let totalMinutes = 0;
      records.forEach(record => {
        if (record.loginTime && record.logoutTime) {
          const login = new Date(record.loginTime);
          const logout = new Date(record.logoutTime);
          const minutes = (logout - login) / (1000 * 60);
          totalMinutes += minutes;
        }
      });
      
      const standardWorkMinutes = 480; // 8 hours
      if (totalMinutes > standardWorkMinutes) {
        const extraMinutes = totalMinutes - standardWorkMinutes;
        totalExtraMinutes += extraMinutes;
      }
    });

    // Calculate salaries
    const extraTimeAmount = totalExtraMinutes * perMinuteSalary;
    
    // Prorated salary based on days in period (including weekends)
    const proratedBasicSalary = (totalDaysInPeriod / 30) * basicSalaryNum;
    
    // Deduct unpaid leaves
    const unpaidLeaveDeduction = unpaidLeaveDays * perDaySalary;
    const adjustedBasicSalary = proratedBasicSalary - unpaidLeaveDeduction;
    
    // Total salary
    const totalSalary = adjustedBasicSalary + extraTimeAmount;

    return {
      employee: {
        id: employee._id,
        name: employee.medicalRepName,
        basicSalary: basicSalaryNum
      },
      period,
      isCurrentMonth,
      salaryCalculation: {
        basicSalary: basicSalaryNum,
        perDaySalary: perDaySalary,
        perMinuteSalary: perMinuteSalary,
        totalDaysInMonth: 30, // Fixed: Always 30 days
        totalDaysInPeriod: totalDaysInPeriod,
        totalWorkingDaysInMonth: totalWorkingDaysInMonth, // For reference
        workingDaysUntilCalculation: workingDaysUntilCalculation,
        presentDays,
        totalLeaves: totalLeaveDays,
        paidLeaves: paidLeaveDays,
        unpaidLeaves: unpaidLeaveDays,
        swapLeaves: swapLeaveDays,
        leaveDeduction: unpaidLeaveDeduction,
        proratedBasicSalary: proratedBasicSalary,
        adjustedBasicSalary: adjustedBasicSalary,
        extraMinutes: totalExtraMinutes,
        extraTimeAmount: extraTimeAmount,
        totalSalary: totalSalary,
        calculationStartDate: startDate.toISOString().split('T')[0],
        calculationEndDate: calculationEndDate.toISOString().split('T')[0],
        isCurrentMonth: isCurrentMonth
      }
    };
  } catch (error) {
    console.error("Error in calculateSalaryForPeriod:", error);
    throw error;
  }
};

// Add new endpoint to fetch basic salary
router.get("/basic-payroll/employee/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID"
      });
    }
    
    const basicPayroll = await MrBasicPayroll.findOne({
      employeeId: employeeId
    });
    
    if (!basicPayroll) {
      return res.status(404).json({
        success: false,
        message: "Basic payroll record not found for employee"
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        _id: basicPayroll._id,
        employeeId: basicPayroll.employeeId,
        currentBasicSalary: basicPayroll.currentBasicSalary || 0,
        currentEffectiveFrom: basicPayroll.currentEffectiveFrom,
        employeeName: basicPayroll.employeeName
      }
    });
  } catch (error) {
    console.error("Error fetching basic payroll:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch basic payroll",
      error: error.message
    });
  }
});

// GET all payrolls (root)
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      period = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = { enabled: true };

    if (status && status !== "all") {
      matchConditions.status = status;
    }

    if (period) {
      if (period.endsWith("-YTD")) {
        const year = period.split("-")[0];
        matchConditions.period = { $regex: `^${year}-`, $options: "i" };
      } else if (period !== "all") {
        matchConditions.period = period;
      }
    }

    let searchConditions = {};
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");

      const matchingStaff = await Staff.find({
        $or: [
          { medicalRepName: searchRegex },
          { teamName: searchRegex },
          { contactNo: searchRegex },
          { email: searchRegex },
        ],
      }).select("_id");

      const staffIds = matchingStaff.map((s) => s._id);

      searchConditions = {
        $or: [
          { payrollCode: searchRegex },
          { paymentMethod: searchRegex },
          { employeeId: { $in: staffIds } },
        ],
      };
    }

    const finalConditions = {
      ...matchConditions,
      ...(Object.keys(searchConditions).length > 0 ? searchConditions : {}),
    };

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const payrolls = await Payroll.find(finalConditions)
      .populate(
        "employeeId",
        "medicalRepName teamName contactNo email date enabled MRId"
      )
      .populate("source", "name code totalAmount")
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const employeeIds = payrolls.map(p => p.employeeId?._id).filter(id => id);
    const basicPayrolls = await MrBasicPayroll.find({
      employeeId: { $in: employeeIds }
    }).lean();

    const basicSalaryMap = {};
    basicPayrolls.forEach(bp => {
      basicSalaryMap[bp.employeeId] = bp.currentBasicSalary || 0;
    });

    const transformedPayrolls = payrolls.map((payroll) => {
      const payrollObj = { ...payroll };

      if (payrollObj.employeeId && typeof payrollObj.employeeId === "object" && payrollObj.employeeId._id) {
        payrollObj.employeeName = payrollObj.employeeId.medicalRepName;
        payrollObj.teamName = payrollObj.employeeId.teamName;
        payrollObj.contactNo = payrollObj.employeeId.contactNo;
        payrollObj.email = payrollObj.employeeId.email;
        payrollObj.joiningDate = payrollObj.employeeId.date;
        payrollObj.employeeEnabled = payrollObj.employeeId.enabled;
        payrollObj.MRId = payrollObj.employeeId.MRId;
        payrollObj.employeeBasicSalary = basicSalaryMap[payrollObj.employeeId._id] || 0;
      } else {
        payrollObj.employeeName = "Unknown";
        payrollObj.teamName = "Unknown";
        payrollObj.contactNo = "N/A";
        payrollObj.email = "N/A";
        payrollObj.joiningDate = null;
        payrollObj.employeeEnabled = false;
        payrollObj.MRId = "N/A";
        payrollObj.employeeBasicSalary = 0;
      }

      return payrollObj;
    });

    const total = await Payroll.countDocuments(finalConditions);
    const totalPages = Math.ceil(total / limitNum);
    const nextPayrollCode = await generateNextPayrollCode();

    res.status(200).json({
      success: true,
      data: transformedPayrolls,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
      },
      nextPayrollCode,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch payrolls",
      error: error.message,
    });
  }
});

// GET export CSV
router.get("/export/csv", async (req, res) => {
  try {
    const {
      search = "",
      status = "",
      period = "",
    } = req.query;

    const matchConditions = { enabled: true };

    if (status && status !== "all") {
      matchConditions.status = status;
    }

    if (period) {
      if (period.endsWith("-YTD")) {
        const year = period.split("-")[0];
        matchConditions.period = { $regex: `^${year}-`, $options: "i" };
      } else if (period !== "all") {
        matchConditions.period = period;
      }
    }

    let searchConditions = {};
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");

      const matchingStaff = await Staff.find({
        $or: [
          { medicalRepName: searchRegex },
          { teamName: searchRegex },
          { contactNo: searchRegex },
          { email: searchRegex },
        ],
      }).select("_id");

      const staffIds = matchingStaff.map((s) => s._id);

      searchConditions = {
        $or: [
          { payrollCode: searchRegex },
          { paymentMethod: searchRegex },
          { employeeId: { $in: staffIds } },
        ],
      };
    }

    const finalConditions = {
      ...matchConditions,
      ...(Object.keys(searchConditions).length > 0 ? searchConditions : {}),
    };

    const payrolls = await Payroll.find(finalConditions)
      .populate(
        "employeeId",
        "medicalRepName teamName contactNo email date enabled MRId"
      )
      .populate("source", "name code totalAmount")
      .sort({ createdAt: -1 })
      .lean();

    const employeeIds = payrolls.map(p => p.employeeId?._id).filter(id => id);
    const basicPayrolls = await MrBasicPayroll.find({
      employeeId: { $in: employeeIds }
    }).lean();

    const basicSalaryMap = {};
    basicPayrolls.forEach(bp => {
      basicSalaryMap[bp.employeeId] = bp.currentBasicSalary || 0;
    });

    const transformedPayrolls = payrolls.map((payroll) => {
      const payrollObj = { ...payroll };

      if (payrollObj.employeeId && typeof payrollObj.employeeId === "object" && payrollObj.employeeId._id) {
        payrollObj.employeeName = payrollObj.employeeId.medicalRepName;
        payrollObj.teamName = payrollObj.employeeId.teamName;
        payrollObj.contactNo = payrollObj.employeeId.contactNo;
        payrollObj.email = payrollObj.employeeId.email;
        payrollObj.joiningDate = payrollObj.employeeId.date;
        payrollObj.employeeEnabled = payrollObj.employeeId.enabled;
        payrollObj.MRId = payrollObj.employeeId.MRId;
        payrollObj.employeeBasicSalary = basicSalaryMap[payrollObj.employeeId._id] || 0;
      } else {
        payrollObj.employeeName = "Unknown";
        payrollObj.teamName = "Unknown";
        payrollObj.contactNo = "N/A";
        payrollObj.email = "N/A";
        payrollObj.joiningDate = null;
        payrollObj.employeeEnabled = false;
        payrollObj.MRId = "N/A";
        payrollObj.employeeBasicSalary = 0;
      }

      payrollObj.allowancesCSV = payrollObj.allowances 
        ? payrollObj.allowances.map(a => `${a.type}: $${a.amount}`).join('; ')
        : '';

      return payrollObj;
    });

    const fields = [
      { label: 'Payroll Code', value: 'payrollCode' },
      { label: 'Employee Name', value: 'employeeName' },
      { label: 'Team', value: 'teamName' },
      { label: 'Period', value: 'period' },
      { label: 'Basic Salary', value: 'basicSalary' },
      { label: 'Allowances', value: 'allowancesCSV' },
      { label: 'Total Allowance', value: 'totalAllowance' },
      { label: 'Deductions', value: 'deductions' },
      { label: 'Net Salary', value: 'netSalary' },
      { label: 'Status', value: 'status' },
      { label: 'Payment Method', value: 'paymentMethod' },
      { label: 'Bank Account', value: 'bankAccount' },
      { label: 'Payment Date', value: 'paymentDate' },
      { label: 'Source Account', value: 'source.name' },
      { label: 'Created At', value: 'createdAt' },
    ];

    const json2csvParser = new Parser({ fields });
    const csvData = json2csvParser.parse(transformedPayrolls);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=payrolls_export.csv');
    
    res.status(200).send(csvData);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to export payrolls",
      error: error.message,
    });
  }
});

// GET single payroll by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findById(id)
      .populate("employeeId", "medicalRepName teamName contactNo email")
      .populate("source", "name code totalAmount");

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll not found",
      });
    }

    const basicPayroll = await MrBasicPayroll.findOne({
      employeeId: payroll.employeeId._id
    });

    const payrollData = payroll.toObject();
    if (payrollData.employeeId) {
      payrollData.employeeName = payrollData.employeeId.medicalRepName;
      payrollData.teamName = payrollData.employeeId.teamName;
      payrollData.contactNo = payrollData.employeeId.contactNo;
      payrollData.email = payrollData.employeeId.email;
      payrollData.employeeBasicSalary = basicPayroll?.currentBasicSalary || 0;
    }

    res.status(200).json({
      success: true,
      data: payrollData,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid payroll ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch payroll",
      error: error.message,
    });
  }
});

// GET list of employees from basic payroll
router.get("/mrs/from-basic-payroll", async (req, res) => {
  try {
    // Fetch all basic payroll records with employee details
    const mrBasicPayrolls = await MrBasicPayroll.find({})
      .populate("employeeId", "medicalRepName")
      .lean();
    // Transform the data to get only id and name
    const mrList = mrBasicPayrolls.map((p) => {
      let employeeId, employeeName;
      
      if (p.employeeId && typeof p.employeeId === 'object' && p.employeeId._id) {
        // Employee is populated
        employeeId = p.employeeId._id;
        employeeName = p.employeeId.medicalRepName;
      } else if (p.employeeId) {
        // Employee is just an ObjectId string
        employeeId = p.employeeId;
        employeeName = p.employeeName || "Unknown Employee";
      } else {
        // No employeeId at all
        employeeId = null;
        employeeName = "Unknown Employee";
      }

      return {
        _id: employeeId,
        medicalRepName: employeeName
      };
    });

    // Filter out any null employeeIds
    const validMrList = mrList.filter(mr => mr._id !== null);
    return res.status(200).json({
      success: true,
      count: validMrList.length,
      data: validMrList,
      message: validMrList.length === 0
        ? "No employee found in basic payroll."
        : "Employee list fetched successfully."
    });

  } catch (error) {
    console.error("❌ Error in /mrs/from-basic-payroll endpoint:", error.message);
    
    return res.status(500).json({
      success: false,
      message: "Failed to fetch employee list.",
      error: error.message
    });
  }
});

// GET calculate salary for period
router.get("/calculate/:employeeId/:period", async (req, res) => {
  try {
    const { employeeId, period } = req.params;

    const periodRegex = /^\d{4}-\d{2}$/;
    if (!periodRegex.test(period)) {
      return res.status(400).json({
        success: false,
        message: "Period must be in YYYY-MM format",
      });
    }

    const calculation = await calculateSalaryForPeriod(employeeId, period);

    res.status(200).json({
      success: true,
      data: calculation,
    });
  } catch (error) {
    if (error.message === "Employee not found" || error.message === "Basic payroll record not found for employee") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to calculate salary",
      error: error.message,
    });
  }
});

// POST create new payroll
router.post("/", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const {
      employeeId,
      period,
      allowances,
      deductions,
      status,
      paymentMethod,
      bankAccount,
      paymentDate,
      remarks,
      source,
    } = req.body;

    if (!employeeId || !period || !source) {
      return res.status(400).json({
        success: false,
        message: "Employee ID, period, and source account are required",
      });
    }

    const periodRegex = /^\d{4}-\d{2}$/;
    if (!periodRegex.test(period)) {
      return res.status(400).json({
        success: false,
        message: "Period must be in YYYY-MM format",
      });
    }

    const employee = await Staff.findById(employeeId).session(session);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const basicPayroll = await MrBasicPayroll.findOne({
      employeeId: employeeId
    }).session(session);

    if (!basicPayroll) {
      return res.status(404).json({
        success: false,
        message: "Basic payroll record not found for employee. Please set basic salary first.",
      });
    }

    const sourceAccount = await Account.findById(source).session(session);
    if (!sourceAccount) {
      return res.status(404).json({
        success: false,
        message: "Source account not found",
      });
    }

    const existingPayroll = await Payroll.findOne({
      employeeId,
      period,
    }).session(session);

    if (existingPayroll) {
      return res.status(409).json({
        success: false,
        message:
          "Payroll record already exists for this employee in the selected period",
      });
    }

    const salaryCalculation = await calculateSalaryForPeriod(employeeId, period, session);
    
    const basicSalaryNum = salaryCalculation.salaryCalculation.totalSalary;
    const deductionsNum = parseFloat(deductions) || 0;
    const leaveDeduction = salaryCalculation.salaryCalculation.leaveDeduction;
    const extraTimeAmount = salaryCalculation.salaryCalculation.extraTimeAmount;

    let totalAllowance = 0;
    let processedAllowances = [];
    if (allowances && Array.isArray(allowances)) {
      for (let allowance of allowances) {
        if (!allowance.type || allowance.amount === undefined) {
          return res.status(400).json({
            success: false,
            message: "Each allowance must have type and amount",
          });
        }

        const allowanceAmount = parseFloat(allowance.amount);
        if (isNaN(allowanceAmount) || allowanceAmount < 0) {
          return res.status(400).json({
            success: false,
            message: "Allowance amount must be a valid non-negative number",
          });
        }

        totalAllowance += allowanceAmount;
        processedAllowances.push({
          type: allowance.type.trim(),
          amount: allowanceAmount,
        });
      }
    }

    const netSalary = basicSalaryNum + totalAllowance - deductionsNum;

    if (netSalary < 0) {
      return res.status(400).json({
        success: false,
        message:
          "Net salary cannot be negative. Please check deductions and allowances.",
      });
    }

    const payrollCode = await generateNextPayrollCode();

    const payrollData = {
      employeeId,
      period,
      basicSalary: basicPayroll.currentBasicSalary,
      adjustedBasicSalary: salaryCalculation.salaryCalculation.adjustedBasicSalary,
      proratedBasicSalary: salaryCalculation.salaryCalculation.proratedBasicSalary,
      extraTimeAmount: extraTimeAmount,
      allowances: processedAllowances,
      totalAllowance: totalAllowance,
      deductions: deductionsNum,
      netSalary: netSalary,
      status: status || "pending",
      paymentMethod: paymentMethod || "bank",
      bankAccount: bankAccount || "",
      paymentDate: paymentDate || null,
      remarks: remarks || "",
      payrollCode: payrollCode,
      source: source,
      createdBy: req.user?._id,
      attendanceInfo: {
        totalWorkingDays: salaryCalculation.salaryCalculation.totalWorkingDays,
        workingDaysUntilCalculationDate: salaryCalculation.salaryCalculation.workingDaysUntilCalculation,
        presentDays: salaryCalculation.salaryCalculation.presentDays,
        totalLeaves: salaryCalculation.salaryCalculation.totalLeaves,
        paidLeaves: salaryCalculation.salaryCalculation.paidLeaves,
        unpaidLeaves: salaryCalculation.salaryCalculation.unpaidLeaves,
        swapLeaves: salaryCalculation.salaryCalculation.swapLeaves,
        perDaySalary: salaryCalculation.salaryCalculation.perDaySalary,
        perMinuteSalary: salaryCalculation.salaryCalculation.perMinuteSalary,
        leaveDeduction: leaveDeduction,
        extraMinutes: salaryCalculation.salaryCalculation.extraMinutes,
        extraTimeAmount: extraTimeAmount,
        calculationDate: salaryCalculation.salaryCalculation.calculationEndDate
      }
    };

    const payroll = new Payroll(payrollData);
    await payroll.save({ session });

    await updateAccountBalance(source, netSalary, "subtract", session);

    await session.commitTransaction();

    await payroll.populate(
      "employeeId",
      "medicalRepName teamName contactNo email"
    );
    await payroll.populate("source", "name code totalAmount");

    const responseData = payroll.toObject();
    if (responseData.employeeId) {
      responseData.employeeName = responseData.employeeId.medicalRepName;
      responseData.teamName = responseData.employeeId.teamName;
      responseData.employeeBasicSalary = basicPayroll.currentBasicSalary;
    }

    res.status(201).json({
      success: true,
      message: "Payroll created successfully",
      data: responseData,
    });
  } catch (error) {
    if (session.transaction?.isActive) {
      try {
        await session.abortTransaction();
      } catch (abortError) {}
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Payroll record already exists for this period",
      });
    }

    if (error.message.includes("Insufficient balance")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("Employee not found") || error.message.includes("Basic payroll record not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// PUT update payroll
router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

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
      enabled,
      source,
    } = req.body;

    const payroll = await Payroll.findById(id)
      .populate("source")
      .session(session);
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll not found",
      });
    }

    const oldNetSalary = payroll.netSalary;
    const oldSource = payroll.source;

    if (basicSalary !== undefined) payroll.basicSalary = parseFloat(basicSalary);
    if (deductions !== undefined) payroll.deductions = parseFloat(deductions);
    if (status) payroll.status = status;
    if (paymentMethod) payroll.paymentMethod = paymentMethod;
    if (bankAccount !== undefined) payroll.bankAccount = bankAccount;
    if (paymentDate !== undefined) payroll.paymentDate = paymentDate;
    if (remarks !== undefined) payroll.remarks = remarks;
    if (enabled !== undefined) payroll.enabled = enabled;
    if (source !== undefined) payroll.source = source;

    if (allowances && Array.isArray(allowances)) {
      payroll.allowances = allowances.map((allowance) => ({
        type: allowance.type.trim(),
        amount: parseFloat(allowance.amount),
      }));

      payroll.totalAllowance = payroll.allowances.reduce(
        (total, allowance) => total + allowance.amount,
        0
      );
    }

    payroll.netSalary =
      payroll.basicSalary + payroll.totalAllowance - payroll.deductions;

    const newNetSalary = payroll.netSalary;
    const newSource = payroll.source;

    if (oldSource && oldSource._id.toString() === newSource.toString()) {
      const amountDifference = newNetSalary - oldNetSalary;
      if (amountDifference !== 0) {
        await updateAccountBalance(
          oldSource._id,
          Math.abs(amountDifference),
          amountDifference > 0 ? "subtract" : "add",
          session
        );
      }
    } else {
      if (oldSource) {
        await updateAccountBalance(oldSource._id, oldNetSalary, "add", session);
      }
      await updateAccountBalance(newSource, newNetSalary, "subtract", session);
    }

    await payroll.save({ session });
    await payroll.populate(
      "employeeId",
      "medicalRepName teamName contactNo email"
    );
    await payroll.populate("source", "name code totalAmount");

    await session.commitTransaction();

    const basicPayroll = await MrBasicPayroll.findOne({
      employeeId: payroll.employeeId._id
    });

    const responseData = payroll.toObject();
    if (responseData.employeeId) {
      responseData.employeeName = responseData.employeeId.medicalRepName;
      responseData.teamName = responseData.employeeId.teamName;
      responseData.employeeBasicSalary = basicPayroll?.currentBasicSalary || 0;
    }

    res.status(200).json({
      success: true,
      message: "Payroll updated successfully",
      data: responseData,
    });
  } catch (error) {
    if (session.transaction?.isActive) {
      try {
        await session.abortTransaction();
      } catch (abortError) {}
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid payroll ID",
      });
    }

    if (error.message.includes("Insufficient balance")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// DELETE single payroll
router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const { id } = req.params;

    const payroll = await Payroll.findById(id)
      .populate("source")
      .session(session);

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll not found",
      });
    }

    if (payroll.source) {
      await updateAccountBalance(
        payroll.source._id,
        payroll.netSalary,
        "add",
        session
      );
    }

    await Payroll.findByIdAndDelete(id).session(session);

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Payroll deleted successfully",
      data: { id },
    });
  } catch (error) {
    if (session.transaction?.isActive) {
      try {
        await session.abortTransaction();
      } catch (abortError) {}
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid payroll ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to delete payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// DELETE multiple payrolls
router.delete("/", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Array of payroll IDs is required",
      });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length) {
      return res.status(400).json({
        success: false,
        message: "Some payroll IDs are invalid",
      });
    }

    const payrollsToDelete = await Payroll.find({ _id: { $in: validIds } })
      .populate("source")
      .session(session);

    if (payrollsToDelete.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No payrolls found to delete",
      });
    }

    for (const payroll of payrollsToDelete) {
      if (payroll.source) {
        await updateAccountBalance(
          payroll.source._id,
          payroll.netSalary,
          "add",
          session
        );
      }
    }

    const result = await Payroll.deleteMany({ _id: { $in: validIds } }).session(
      session
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} payroll(s) deleted successfully`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    if (session.transaction?.isActive) {
      try {
        await session.abortTransaction();
      } catch (abortError) {}
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to delete payrolls",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

export default router;