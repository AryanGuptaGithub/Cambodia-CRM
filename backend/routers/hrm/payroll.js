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

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Generate the next PR-XXXX code.
 * Only called explicitly for the single-payroll POST endpoint.
 * The /bulk endpoint relies on the schema's pre('validate') hook instead,
 * which generates unique codes automatically per document.
 */
const generateNextPayrollCode = async (session = null) => {
  const query = Payroll.findOne({})
    .sort({ createdAt: -1 })
    .select("payrollCode");
  if (session) query.session(session);
  const latest = await query;
  let nextNumber = 1;
  if (latest && latest.payrollCode) {
    const m = latest.payrollCode.match(/PR-(\d+)/);
    if (m && m[1]) nextNumber = parseInt(m[1]) + 1;
  }
  return `PR-${nextNumber.toString().padStart(4, "0")}`;
};

const updateAccountBalance = async (
  accountId,
  amount,
  operation = "subtract",
  session = null,
) => {
  const account = await Account.findById(accountId).session(session);
  if (!account) throw new Error(`Account with ID ${accountId} not found`);
  if (operation === "subtract") {
    if (account.totalAmount < amount)
      throw new Error(
        `Insufficient balance in account ${account.name}. Available: ${account.totalAmount}, Required: ${amount}`,
      );
    account.totalAmount -= amount;
  } else if (operation === "add") {
    account.totalAmount += amount;
  }
  await account.save({ session });
  return account;
};

const calculateSalaryForPeriod = async (employeeId, period, session = null) => {
  const employee = await Staff.findById(employeeId).session(session);
  if (!employee) throw new Error("Employee not found in staff records");

  const basicPayroll = await MrBasicPayroll.findOne({ employeeId }).session(
    session,
  );
  if (!basicPayroll)
    throw new Error("Basic payroll record not found for employee");

  const basicSalaryNum = parseFloat(basicPayroll.currentBasicSalary || 0);
  const perDaySalary = basicSalaryNum / 30;
  const perMinuteSalary = perDaySalary / (8 * 60);

  const [year, month] = period.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const now = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;
  const calculationEndDate = isCurrentMonth
    ? (() => {
        const d = new Date(now);
        d.setUTCHours(23, 59, 59, 999);
        return d;
      })()
    : year < now.getFullYear() || month < now.getMonth() + 1
      ? endDate
      : startDate;

  const totalDaysInPeriod =
    Math.floor((calculationEndDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  let totalWorkingDaysInMonth = 0;
  let workingDaysUntilCalculation = 0;
  for (
    let d = new Date(startDate);
    d <= endDate;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      totalWorkingDaysInMonth++;
      if (d <= calculationEndDate) workingDaysUntilCalculation++;
    }
  }

  const attendanceRecords = await Attendance.find({
    userId: employeeId,
    loginTime: { $gte: startDate, $lte: calculationEndDate },
  }).session(session || null);

  const leaveRecords = await Leave.find({
    userId: employeeId,
    leaveDate: { $gte: startDate, $lte: calculationEndDate },
    status: "approved",
  }).session(session || null);

  let totalLeaveDays = 0,
    paidLeaveDays = 0,
    unpaidLeaveDays = 0,
    swapLeaveDays = 0;
  const leaveDatesSet = new Set();
  for (const leave of leaveRecords) {
    const leaveDate = new Date(leave.leaveDate);
    const dateStr = leaveDate.toISOString().split("T")[0];
    const dow = leaveDate.getUTCDay();
    if (dow !== 0 && dow !== 6 && !leaveDatesSet.has(dateStr)) {
      leaveDatesSet.add(dateStr);
      totalLeaveDays++;
      if (leave.leaveType === "unpaid") unpaidLeaveDays++;
      else if (leave.leaveType === "paid") paidLeaveDays++;
      else if (leave.leaveType === "swapleave") {
        swapLeaveDays++;
        paidLeaveDays++;
      } else if (["holiday", "sunday"].includes(leave.leaveType))
        paidLeaveDays++;
    }
  }

  const presentDaysSet = new Set();
  attendanceRecords.forEach((r) =>
    presentDaysSet.add(r.loginTime.toISOString().split("T")[0]),
  );
  const presentDays = presentDaysSet.size;

  let totalExtraMinutes = 0;
  const attendanceByDate = {};
  attendanceRecords.forEach((r) => {
    const ds = r.loginTime.toISOString().split("T")[0];
    if (!attendanceByDate[ds]) attendanceByDate[ds] = [];
    attendanceByDate[ds].push(r);
  });
  Object.values(attendanceByDate).forEach((records) => {
    const totalMinutes = records.reduce(
      (sum, r) =>
        r.loginTime && r.logoutTime
          ? sum + (new Date(r.logoutTime) - new Date(r.loginTime)) / 60000
          : sum,
      0,
    );
    if (totalMinutes > 480) totalExtraMinutes += totalMinutes - 480;
  });

  const extraTimeAmount = totalExtraMinutes * perMinuteSalary;
  const proratedBasicSalary = (totalDaysInPeriod / 30) * basicSalaryNum;
  const unpaidLeaveDeduction = unpaidLeaveDays * perDaySalary;
  const adjustedBasicSalary = proratedBasicSalary - unpaidLeaveDeduction;
  const totalSalary = adjustedBasicSalary + extraTimeAmount;

  return {
    employee: {
      id: employee._id,
      name: employee.medicalRepName,
      basicSalary: basicSalaryNum,
    },
    period,
    isCurrentMonth,
    salaryCalculation: {
      basicSalary: basicSalaryNum,
      perDaySalary,
      perMinuteSalary,
      totalDaysInMonth: 30,
      totalDaysInPeriod,
      totalWorkingDaysInMonth,
      workingDaysUntilCalculation,
      presentDays,
      totalLeaves: totalLeaveDays,
      paidLeaves: paidLeaveDays,
      unpaidLeaves: unpaidLeaveDays,
      swapLeaves: swapLeaveDays,
      leaveDeduction: unpaidLeaveDeduction,
      proratedBasicSalary,
      adjustedBasicSalary,
      extraMinutes: totalExtraMinutes,
      extraTimeAmount,
      totalSalary,
      calculationStartDate: startDate.toISOString().split("T")[0],
      calculationEndDate: calculationEndDate.toISOString().split("T")[0],
      isCurrentMonth,
    },
  };
};

// ─────────────────────────────────────────────
// GET /mrs/all
// All active staff — used by the Previous Month tab.
// ─────────────────────────────────────────────
router.get("/mrs/all", async (req, res) => {
  try {
    const staffList = await Staff.find({ enabled: { $ne: false } })
      .select("_id medicalRepName MRId teamName")
      .lean();

    const mrList = staffList.map((s) => ({
      _id: s._id,
      medicalRepName: s.medicalRepName || `MR ${s._id}`,
      MRId: s.MRId,
      teamName: s.teamName,
    }));

    return res.status(200).json({
      success: true,
      count: mrList.length,
      data: mrList,
      message:
        mrList.length === 0
          ? "No staff members found."
          : "Staff list fetched successfully.",
    });
  } catch (error) {
    console.error("Error in /mrs/all:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch staff list.",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /basic-payroll/employee/:employeeId
// ─────────────────────────────────────────────
router.get("/basic-payroll/employee/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(employeeId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid employee ID" });

    const basicPayroll = await MrBasicPayroll.findOne({ employeeId });
    if (!basicPayroll)
      return res.status(404).json({
        success: false,
        message: "Basic payroll record not found for employee",
      });

    res.status(200).json({
      success: true,
      data: {
        _id: basicPayroll._id,
        employeeId: basicPayroll.employeeId,
        currentBasicSalary: basicPayroll.currentBasicSalary || 0,
        currentEffectiveFrom: basicPayroll.currentEffectiveFrom,
        employeeName: basicPayroll.employeeName,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch basic payroll",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /  — list all payrolls
// ─────────────────────────────────────────────
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
    if (status && status !== "all") matchConditions.status = status;
    if (period) {
      if (period.endsWith("-YTD"))
        matchConditions.period = {
          $regex: `^${period.split("-")[0]}-`,
          $options: "i",
        };
      else if (period !== "all") matchConditions.period = period;
    }

    let searchConditions = {};
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      const staffIds = (
        await Staff.find({
          $or: [
            { medicalRepName: searchRegex },
            { teamName: searchRegex },
            { contactNo: searchRegex },
            { email: searchRegex },
          ],
        }).select("_id")
      ).map((s) => s._id);
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
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    const payrolls = await Payroll.find(finalConditions)
      .populate(
        "employeeId",
        "medicalRepName teamName contactNo email date enabled MRId",
      )
      .populate("source", "name code totalAmount")
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const employeeIds = payrolls.map((p) => p.employeeId?._id).filter(Boolean);
    const basicPayrolls = await MrBasicPayroll.find({
      employeeId: { $in: employeeIds },
    }).lean();
    const basicSalaryMap = {};
    basicPayrolls.forEach(
      (bp) => (basicSalaryMap[bp.employeeId] = bp.currentBasicSalary || 0),
    );

    const transformedPayrolls = payrolls.map((payroll) => {
      const obj = { ...payroll };
      if (
        obj.employeeId &&
        typeof obj.employeeId === "object" &&
        obj.employeeId._id
      ) {
        obj.employeeName = obj.employeeId.medicalRepName;
        obj.teamName = obj.employeeId.teamName;
        obj.contactNo = obj.employeeId.contactNo;
        obj.email = obj.employeeId.email;
        obj.joiningDate = obj.employeeId.date;
        obj.employeeEnabled = obj.employeeId.enabled;
        obj.MRId = obj.employeeId.MRId;
        obj.employeeBasicSalary = basicSalaryMap[obj.employeeId._id] || 0;
      } else {
        obj.employeeName = "Unknown";
        obj.teamName = "Unknown";
        obj.contactNo = "N/A";
        obj.email = "N/A";
        obj.joiningDate = null;
        obj.employeeEnabled = false;
        obj.MRId = "N/A";
        obj.employeeBasicSalary = 0;
      }
      return obj;
    });

    const total = await Payroll.countDocuments(finalConditions);
    const nextPayrollCode = await generateNextPayrollCode();

    res.status(200).json({
      success: true,
      data: transformedPayrolls,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
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

// ─────────────────────────────────────────────
// GET /export/csv
// ─────────────────────────────────────────────
router.get("/export/csv", async (req, res) => {
  try {
    const { search = "", status = "", period = "" } = req.query;
    const matchConditions = { enabled: true };
    if (status && status !== "all") matchConditions.status = status;
    if (period) {
      if (period.endsWith("-YTD"))
        matchConditions.period = {
          $regex: `^${period.split("-")[0]}-`,
          $options: "i",
        };
      else if (period !== "all") matchConditions.period = period;
    }

    let searchConditions = {};
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      const staffIds = (
        await Staff.find({
          $or: [
            { medicalRepName: searchRegex },
            { teamName: searchRegex },
            { contactNo: searchRegex },
            { email: searchRegex },
          ],
        }).select("_id")
      ).map((s) => s._id);
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
        "medicalRepName teamName contactNo email date enabled MRId",
      )
      .populate("source", "name code totalAmount")
      .sort({ createdAt: -1 })
      .lean();

    const employeeIds = payrolls.map((p) => p.employeeId?._id).filter(Boolean);
    const basicPayrolls = await MrBasicPayroll.find({
      employeeId: { $in: employeeIds },
    }).lean();
    const basicSalaryMap = {};
    basicPayrolls.forEach(
      (bp) => (basicSalaryMap[bp.employeeId] = bp.currentBasicSalary || 0),
    );

    const transformed = payrolls.map((payroll) => {
      const obj = { ...payroll };
      if (
        obj.employeeId &&
        typeof obj.employeeId === "object" &&
        obj.employeeId._id
      ) {
        obj.employeeName = obj.employeeId.medicalRepName;
        obj.teamName = obj.employeeId.teamName;
        obj.contactNo = obj.employeeId.contactNo;
        obj.email = obj.employeeId.email;
        obj.joiningDate = obj.employeeId.date;
        obj.employeeEnabled = obj.employeeId.enabled;
        obj.MRId = obj.employeeId.MRId;
        obj.employeeBasicSalary = basicSalaryMap[obj.employeeId._id] || 0;
      } else {
        obj.employeeName = "Unknown";
        obj.teamName = "Unknown";
        obj.contactNo = "N/A";
        obj.email = "N/A";
        obj.joiningDate = null;
        obj.employeeEnabled = false;
        obj.MRId = "N/A";
        obj.employeeBasicSalary = 0;
      }
      obj.allowancesCSV = obj.allowances
        ? obj.allowances.map((a) => `${a.type}: $${a.amount}`).join("; ")
        : "";
      return obj;
    });

    const fields = [
      { label: "Payroll Code", value: "payrollCode" },
      { label: "Employee Name", value: "employeeName" },
      { label: "Team", value: "teamName" },
      { label: "Period", value: "period" },
      { label: "Basic Salary", value: "basicSalary" },
      { label: "Allowances", value: "allowancesCSV" },
      { label: "Total Allowance", value: "totalAllowance" },
      { label: "Deductions", value: "deductions" },
      { label: "Net Salary", value: "netSalary" },
      { label: "Status", value: "status" },
      { label: "Payment Method", value: "paymentMethod" },
      { label: "Bank Account", value: "bankAccount" },
      { label: "Payment Date", value: "paymentDate" },
      { label: "Source Account", value: "source.name" },
      { label: "Payroll Type", value: "payrollType" },
      { label: "Created At", value: "createdAt" },
    ];

    const csvData = new Parser({ fields }).parse(transformed);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=payrolls_export.csv",
    );
    res.status(200).send(csvData);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to export payrolls",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /mrs/from-basic-payroll
// Only MRs with a basic payroll record — Current Month tab.
// ─────────────────────────────────────────────
router.get("/mrs/from-basic-payroll", async (req, res) => {
  try {
    const mrBasicPayrolls = await MrBasicPayroll.find({})
      .populate("employeeId", "medicalRepName")
      .lean();

    const mrList = mrBasicPayrolls
      .map((p) => {
        if (
          p.employeeId &&
          typeof p.employeeId === "object" &&
          p.employeeId._id
        )
          return {
            _id: p.employeeId._id,
            medicalRepName: p.employeeId.medicalRepName,
          };
        else if (p.employeeId)
          return {
            _id: p.employeeId,
            medicalRepName: p.employeeName || "Unknown Employee",
          };
        return null;
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      count: mrList.length,
      data: mrList,
      message:
        mrList.length === 0
          ? "No employee found in basic payroll."
          : "Employee list fetched successfully.",
    });
  } catch (error) {
    console.error("Error in /mrs/from-basic-payroll:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch employee list.",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /calculate/:employeeId/:period
// ─────────────────────────────────────────────
router.get("/calculate/:employeeId/:period", async (req, res) => {
  try {
    const { employeeId, period } = req.params;
    if (!/^\d{4}-\d{2}$/.test(period))
      return res
        .status(400)
        .json({ success: false, message: "Period must be in YYYY-MM format" });
    const calculation = await calculateSalaryForPeriod(employeeId, period);
    res.status(200).json({ success: true, data: calculation });
  } catch (error) {
    if (
      [
        "Employee not found in staff records",
        "Basic payroll record not found for employee",
      ].includes(error.message)
    )
      return res.status(404).json({ success: false, message: error.message });
    res.status(500).json({
      success: false,
      message: "Failed to calculate salary",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /:id  — single payroll
// ─────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id)
      .populate("employeeId", "medicalRepName teamName contactNo email")
      .populate("source", "name code totalAmount");
    if (!payroll)
      return res
        .status(404)
        .json({ success: false, message: "Payroll not found" });
    const basicPayroll = await MrBasicPayroll.findOne({
      employeeId: payroll.employeeId._id,
    });
    const data = payroll.toObject();
    if (data.employeeId) {
      data.employeeName = data.employeeId.medicalRepName;
      data.teamName = data.employeeId.teamName;
      data.contactNo = data.employeeId.contactNo;
      data.email = data.employeeId.email;
      data.employeeBasicSalary = basicPayroll?.currentBasicSalary || 0;
    }
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid payroll ID" });
    res.status(500).json({
      success: false,
      message: "Failed to fetch payroll",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────
// POST /bulk
// Creates multiple PREVIOUS MONTH payroll records.
//
// Root causes of the original 400 error — all fixed:
//
//  FIX 1: source field
//    The schema originally had source: { required: true }.
//    Bulk/previous-month entries have no account to debit,
//    so source must be omitted. The Payroll.js model now has
//    source: { required: false, default: null }.
//    We do NOT send source in payrollData here.
//
//  FIX 2: payrollCode uniqueness race
//    The old code called generateNextPayrollCode() inside the loop.
//    Every call read the same "latest" DB record (none of the
//    in-progress docs were committed yet), so every record got
//    the same code → unique-index violation → 400.
//    Fix: do NOT pass payrollCode at all — the schema's
//    pre('validate') hook generates a unique code per document
//    using this.constructor.findOne(), which correctly sees the
//    already-saved docs within the transaction.
//
//  FIX 3: netSalary NaN guard
//    parseFloat(undefined) = NaN. Now always falls back to 0.
//
//  FIX 4: per-record try/catch
//    One bad record no longer aborts the entire batch.
// ─────────────────────────────────────────────
router.post("/bulk", async (req, res) => {
  // Basic shape check — before opening a session
  const records = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Request body must be a non-empty array of payroll records",
    });
  }

  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    const results = [];
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const {
        employeeId,
        period,
        basicSalary,
        allowances = [],
        totalAllowance = 0,
        deductions = 0,
        netSalary,
        status = "pending",
      } = record;

      // ── Validation ──
      if (!employeeId || !period) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: employeeId and period are required`,
        });
        continue;
      }
      if (!/^\d{4}-\d{2}$/.test(String(period))) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: Period must be YYYY-MM format (got "${period}")`,
        });
        continue;
      }
      if (!mongoose.Types.ObjectId.isValid(employeeId)) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: Invalid employeeId "${employeeId}"`,
        });
        continue;
      }

      // ── Employee check ──
      const employee = await Staff.findById(employeeId).session(session);
      if (!employee) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: Employee not found (id: ${employeeId})`,
        });
        continue;
      }

      // ── Duplicate check ──
      const existing = await Payroll.findOne({ employeeId, period }).session(
        session,
      );
      if (existing) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: Payroll already exists for ${employee.medicalRepName} in ${period}`,
        });
        continue;
      }

      // ── Compute values safely ──
      const basicNum = parseFloat(basicSalary) || 0;
      const allowanceNum = parseFloat(totalAllowance) || 0;
      const deductionNum = parseFloat(deductions) || 0;

      const rawNet =
        netSalary !== undefined && netSalary !== null
          ? parseFloat(netSalary)
          : NaN;
      const computedNet = !isNaN(rawNet)
        ? rawNet
        : basicNum + allowanceNum - deductionNum;

      const processedAllowances = Array.isArray(allowances)
        ? allowances
            .filter((a) => a && a.type)
            .map((a) => ({
              type: String(a.type).trim(),
              amount: parseFloat(a.amount) || 0,
            }))
        : [];

      // ── Build payroll document ──
      // IMPORTANT: Do NOT set payrollCode here.
      // The schema's pre('validate') hook generates it automatically,
      // and each call to this.constructor.findOne() within the hook
      // correctly reads the latest committed code, giving each
      // document in the batch a unique incremented code.
      //
      // IMPORTANT: Do NOT set source here.
      // The schema now has source: { required: false, default: null }.
      // Previous-month entries have no account to debit.
      const payrollData = {
        employeeId,
        period,
        basicSalary: basicNum,
        allowances: processedAllowances,
        // totalAllowance and netSalary are recalculated by pre('save') hooks,
        // but we send them too so the hook values are at least sane.
        totalAllowance: allowanceNum,
        deductions: deductionNum,
        netSalary: computedNet,
        status,
        paymentMethod: "bank",
        payrollType: "previous",
        // source: intentionally omitted — not required for previous-month entries
      };

      // ── Save with per-record error capture ──
      try {
        const payroll = new Payroll(payrollData);
        await payroll.save({ session });
        results.push({
          id: payroll._id,
          code: payroll.payrollCode,
          employee: employee.medicalRepName,
        });
      } catch (saveError) {
        let msg = saveError.message;
        if (saveError.name === "ValidationError") {
          msg = Object.values(saveError.errors)
            .map((e) => e.message)
            .join("; ");
        }
        console.error(`Bulk payroll record ${i + 1} save error:`, msg);
        errors.push({
          index: i,
          message: `Record ${i + 1} (${employee.medicalRepName}): ${msg}`,
        });
      }
    }

    // ── Commit or abort ──
    if (results.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "No records could be saved. See errors for details.",
        errors,
      });
    }

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: `${results.length} payroll record(s) created successfully${errors.length > 0 ? `, ${errors.length} skipped` : ""}`,
      data: {
        created: results.length,
        skipped: errors.length,
        records: results,
        ...(errors.length > 0 && { errors }),
      },
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    console.error("Bulk payroll fatal error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((v) => v.message),
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to create bulk payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ─────────────────────────────────────────────
// POST /  — create single payroll (Current Month)
// ─────────────────────────────────────────────
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

    if (!employeeId || !period || !source)
      return res.status(400).json({
        success: false,
        message: "Employee ID, period, and source account are required",
      });
    if (!/^\d{4}-\d{2}$/.test(period))
      return res
        .status(400)
        .json({ success: false, message: "Period must be in YYYY-MM format" });

    const employee = await Staff.findById(employeeId).session(session);
    if (!employee)
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });

    const basicPayroll = await MrBasicPayroll.findOne({ employeeId }).session(
      session,
    );
    if (!basicPayroll)
      return res.status(404).json({
        success: false,
        message:
          "Basic payroll record not found for employee. Please set basic salary first.",
      });

    const sourceAccount = await Account.findById(source).session(session);
    if (!sourceAccount)
      return res
        .status(404)
        .json({ success: false, message: "Source account not found" });

    const existingPayroll = await Payroll.findOne({
      employeeId,
      period,
    }).session(session);
    if (existingPayroll)
      return res.status(409).json({
        success: false,
        message:
          "Payroll record already exists for this employee in the selected period",
      });

    const salaryCalculation = await calculateSalaryForPeriod(
      employeeId,
      period,
      session,
    );
    const basicSalaryNum = salaryCalculation.salaryCalculation.totalSalary;
    const deductionsNum = parseFloat(deductions) || 0;
    const leaveDeduction = salaryCalculation.salaryCalculation.leaveDeduction;
    const extraTimeAmount = salaryCalculation.salaryCalculation.extraTimeAmount;

    let totalAllowance = 0;
    const processedAllowances = [];
    if (allowances && Array.isArray(allowances)) {
      for (const allowance of allowances) {
        if (!allowance.type || allowance.amount === undefined)
          return res.status(400).json({
            success: false,
            message: "Each allowance must have type and amount",
          });
        const amt = parseFloat(allowance.amount);
        if (isNaN(amt) || amt < 0)
          return res.status(400).json({
            success: false,
            message: "Allowance amount must be a valid non-negative number",
          });
        totalAllowance += amt;
        processedAllowances.push({ type: allowance.type.trim(), amount: amt });
      }
    }

    const netSalary = basicSalaryNum + totalAllowance - deductionsNum;
    if (netSalary < 0)
      return res
        .status(400)
        .json({ success: false, message: "Net salary cannot be negative." });

    // For current-month single payroll we pass payrollCode explicitly
    // so it matches what was shown to the user in the UI.
    const payrollCode = await generateNextPayrollCode(session);

    const payroll = new Payroll({
      employeeId,
      period,
      basicSalary: basicPayroll.currentBasicSalary,
      adjustedBasicSalary:
        salaryCalculation.salaryCalculation.adjustedBasicSalary,
      proratedBasicSalary:
        salaryCalculation.salaryCalculation.proratedBasicSalary,
      extraTimeAmount,
      allowances: processedAllowances,
      totalAllowance,
      deductions: deductionsNum,
      netSalary,
      status: status || "pending",
      paymentMethod: paymentMethod || "bank",
      bankAccount: bankAccount || "",
      paymentDate: paymentDate || null,
      remarks: remarks || "",
      payrollCode,
      source,
      payrollType: "current",
      createdBy: req.user?._id,
      attendanceInfo: {
        totalWorkingDays: salaryCalculation.salaryCalculation.totalWorkingDays,
        workingDaysUntilCalculationDate:
          salaryCalculation.salaryCalculation.workingDaysUntilCalculation,
        presentDays: salaryCalculation.salaryCalculation.presentDays,
        totalLeaves: salaryCalculation.salaryCalculation.totalLeaves,
        paidLeaves: salaryCalculation.salaryCalculation.paidLeaves,
        unpaidLeaves: salaryCalculation.salaryCalculation.unpaidLeaves,
        swapLeaves: salaryCalculation.salaryCalculation.swapLeaves,
        perDaySalary: salaryCalculation.salaryCalculation.perDaySalary,
        perMinuteSalary: salaryCalculation.salaryCalculation.perMinuteSalary,
        leaveDeduction,
        extraMinutes: salaryCalculation.salaryCalculation.extraMinutes,
        extraTimeAmount,
        calculationDate: salaryCalculation.salaryCalculation.calculationEndDate,
      },
    });

    await payroll.save({ session });
    await updateAccountBalance(source, netSalary, "subtract", session);
    await session.commitTransaction();

    await payroll.populate(
      "employeeId",
      "medicalRepName teamName contactNo email",
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
    try {
      await session.abortTransaction();
    } catch (_) {}
    if (error.name === "ValidationError")
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((v) => v.message),
      });
    if (error.code === 11000)
      return res.status(409).json({
        success: false,
        message: "Payroll record already exists for this period",
      });
    if (error.message.includes("Insufficient balance"))
      return res.status(400).json({ success: false, message: error.message });
    if (error.message.includes("not found"))
      return res.status(404).json({ success: false, message: error.message });
    res.status(500).json({
      success: false,
      message: "Failed to create payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ─────────────────────────────────────────────
// PUT /:id
// ─────────────────────────────────────────────
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
    if (!payroll)
      return res
        .status(404)
        .json({ success: false, message: "Payroll not found" });

    const oldNetSalary = payroll.netSalary;
    const oldSource = payroll.source;

    if (basicSalary !== undefined)
      payroll.basicSalary = parseFloat(basicSalary);
    if (deductions !== undefined) payroll.deductions = parseFloat(deductions);
    if (status) payroll.status = status;
    if (paymentMethod) payroll.paymentMethod = paymentMethod;
    if (bankAccount !== undefined) payroll.bankAccount = bankAccount;
    if (paymentDate !== undefined) payroll.paymentDate = paymentDate;
    if (remarks !== undefined) payroll.remarks = remarks;
    if (enabled !== undefined) payroll.enabled = enabled;
    if (source !== undefined) payroll.source = source;

    if (allowances && Array.isArray(allowances)) {
      payroll.allowances = allowances.map((a) => ({
        type: a.type.trim(),
        amount: parseFloat(a.amount),
      }));
      payroll.totalAllowance = payroll.allowances.reduce(
        (t, a) => t + a.amount,
        0,
      );
    }
    payroll.netSalary =
      payroll.basicSalary + payroll.totalAllowance - payroll.deductions;

    const newNetSalary = payroll.netSalary;
    const newSource = payroll.source;

    // Only adjust account balance if this payroll has a source account
    if (oldSource && newSource) {
      if (oldSource._id.toString() === newSource.toString()) {
        const diff = newNetSalary - oldNetSalary;
        if (diff !== 0)
          await updateAccountBalance(
            oldSource._id,
            Math.abs(diff),
            diff > 0 ? "subtract" : "add",
            session,
          );
      } else {
        await updateAccountBalance(oldSource._id, oldNetSalary, "add", session);
        await updateAccountBalance(
          newSource,
          newNetSalary,
          "subtract",
          session,
        );
      }
    } else if (!oldSource && newSource) {
      // Assigning a source for the first time (e.g. upgrading a previous-month record)
      await updateAccountBalance(newSource, newNetSalary, "subtract", session);
    } else if (oldSource && !newSource) {
      // Removing the source — refund the old account
      await updateAccountBalance(oldSource._id, oldNetSalary, "add", session);
    }

    await payroll.save({ session });
    await payroll.populate(
      "employeeId",
      "medicalRepName teamName contactNo email",
    );
    await payroll.populate("source", "name code totalAmount");
    await session.commitTransaction();

    const basicPayroll = await MrBasicPayroll.findOne({
      employeeId: payroll.employeeId._id,
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
    try {
      await session.abortTransaction();
    } catch (_) {}
    if (error.name === "ValidationError")
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((v) => v.message),
      });
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid payroll ID" });
    if (error.message.includes("Insufficient balance"))
      return res.status(400).json({ success: false, message: error.message });
    res.status(500).json({
      success: false,
      message: "Failed to update payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ─────────────────────────────────────────────
// DELETE /:id
// ─────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const payroll = await Payroll.findById(req.params.id)
      .populate("source")
      .session(session);
    if (!payroll)
      return res
        .status(404)
        .json({ success: false, message: "Payroll not found" });
    // Only refund if this payroll had a source account
    if (payroll.source)
      await updateAccountBalance(
        payroll.source._id,
        payroll.netSalary,
        "add",
        session,
      );
    await Payroll.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();
    res.status(200).json({
      success: true,
      message: "Payroll deleted successfully",
      data: { id: req.params.id },
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid payroll ID" });
    res.status(500).json({
      success: false,
      message: "Failed to delete payroll",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
});

// ─────────────────────────────────────────────
// DELETE /  — bulk delete
// ─────────────────────────────────────────────
router.delete("/", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "Array of payroll IDs is required" });
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length)
      return res
        .status(400)
        .json({ success: false, message: "Some payroll IDs are invalid" });

    const toDelete = await Payroll.find({ _id: { $in: validIds } })
      .populate("source")
      .session(session);
    if (toDelete.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "No payrolls found to delete" });

    for (const p of toDelete) {
      // Only refund if the payroll had a source account (current-month entries do, previous-month bulk entries don't)
      if (p.source)
        await updateAccountBalance(p.source._id, p.netSalary, "add", session);
    }
    const result = await Payroll.deleteMany({ _id: { $in: validIds } }).session(
      session,
    );
    await session.commitTransaction();
    res.status(200).json({
      success: true,
      message: `${result.deletedCount} payroll(s) deleted successfully`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
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
