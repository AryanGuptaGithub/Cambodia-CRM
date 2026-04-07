import express from "express";
import Payroll from "../../models/Hrm/Payroll.js";
import Staff from "../../models/staffMember/staff.js";
import MrBasicPayroll from "../../models/Hrm/MRBasicPayroll.js";
import Account from "../../models/accounts/Destination.js";
import Attendance from "../../models/Hrm/Attendance.js";
import Leave from "../../models/Hrm/Leaves.js";
import MrAdvance from "../../models/Hrm/MrAdvance.js";
import PayrollPayment from "../../models/Hrm/Payroll.js";
import mongoose from "mongoose";
import { Parser } from "json2csv";

// ✅ Import your Expense model and Transaction/Statement model
// Adjust these import paths to match your actual model file locations
import Expense from "../../models/expenses/addExpense.js";
import Transaction from "../../models/accounts/Transaction.js"; // cash & bank statement

const router = express.Router();

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const generateNextPayrollCode = async (session = null) => {
  const query = Payroll.findOne({})
    .sort({ createdAt: -1 })
    .select("payrollCode");
  if (session) query.session(session);
  const latest = await query;
  let nextNumber = 1;
  if (latest?.payrollCode) {
    const m = latest.payrollCode.match(/PR-(\d+)/);
    if (m?.[1]) nextNumber = parseInt(m[1]) + 1;
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
  if (!account) throw new Error(`Account ${accountId} not found`);
  if (operation === "subtract") {
    if (account.totalAmount < amount)
      throw new Error(
        `Insufficient balance in ${account.name}. Available: ${account.totalAmount}, Required: ${amount}`,
      );
    account.totalAmount -= amount;
  } else if (operation === "add") {
    account.totalAmount += amount;
  }
  await account.save({ session });
  return account;
};

const getPendingAdvance = async (employeeId, session = null) => {
  try {
    let agg = MrAdvance.aggregate([
      {
        $match: {
          employeeId: new mongoose.Types.ObjectId(employeeId),
          status: "pending",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    if (session) agg = agg.session(session);
    const result = await agg;
    return result[0]?.total || 0;
  } catch {
    return 0;
  }
};

const calculateSalaryForPeriod = async (employeeId, period, session = null) => {
  const employee = await Staff.findById(employeeId).session(session);
  if (!employee) throw new Error("Employee not found in staff records");

  const basicPayroll = await MrBasicPayroll.findOne({ employeeId }).session(
    session,
  );
  if (!basicPayroll)
    throw new Error("Basic payroll record not found for employee");

  const fullBasicSalary = parseFloat(basicPayroll.currentBasicSalary || 0);
  const perDaySalary = fullBasicSalary / 30;
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

  let totalWorkingDaysInMonth = 0,
    workingDaysUntilCalculation = 0;
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
  const proratedBasicSalary = (totalDaysInPeriod / 30) * fullBasicSalary;
  const unpaidLeaveDeduction = unpaidLeaveDays * perDaySalary;
  const adjustedBasicSalary =
    proratedBasicSalary - unpaidLeaveDeduction + extraTimeAmount;
  const advanceDeduction = await getPendingAdvance(employeeId, session);
  let totalSalary = adjustedBasicSalary - advanceDeduction;
  if (totalSalary > fullBasicSalary) totalSalary = fullBasicSalary;
  if (totalSalary < 0) totalSalary = 0;

  return {
    employee: {
      id: employee._id,
      name: employee.medicalRepName,
      basicSalary: fullBasicSalary,
    },
    period,
    isCurrentMonth,
    salaryCalculation: {
      basicSalary: fullBasicSalary,
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
      advanceDeduction,
      totalSalary,
      calculationStartDate: startDate.toISOString().split("T")[0],
      calculationEndDate: calculationEndDate.toISOString().split("T")[0],
      isCurrentMonth,
    },
  };
};

// ─────────────────────────────────────────────
// ✅ NEW HELPER: create cash & bank statement + expense entry
// Called after payroll is saved successfully
// ─────────────────────────────────────────────
const createPayrollFinancialRecords = async ({
  payroll,
  employee,
  sourceAccounts, // [{ account, amount }]
  period,
  session,
}) => {
  const payrollDate = new Date();
  const description = `Salary payment - ${employee.medicalRepName} (${period}) [${payroll.payrollCode}]`;

  // 1. ✅ Create a Transaction (cash & bank statement) for EACH source account used
  for (const { account, amount } of sourceAccounts) {
    try {
      // Only create if Transaction model exists and has the right fields.
      // Adjust field names to match your Transaction/Statement schema.
      const txn = new Transaction({
        accountId: account._id,
        accountName: account.name,
        type: "debit", // money leaving the account
        category: "Salary",
        amount: amount,
        description: description,
        reference: payroll.payrollCode,
        date: payrollDate,
        employeeId: payroll.employeeId,
        payrollId: payroll._id,
        createdBy: payroll.createdBy || null,
      });
      await txn.save({ session });
    } catch (txnErr) {
      // Log but don't block — Transaction model may not exist yet
      console.warn("Could not create Transaction record:", txnErr.message);
    }
  }

  // 2. ✅ Create an Expense entry for the total salary paid
  try {
    // Adjust field names to match your Expense schema.
    const expense = new Expense({
      category: "Salary", // or use your category ObjectId
      amount: payroll.netSalary,
      description: description,
      date: payrollDate,
      reference: payroll.payrollCode,
      employeeId: payroll.employeeId,
      payrollId: payroll._id,
      period: period,
      remarks: `Auto-generated from payroll ${payroll.payrollCode}`,
      createdBy: payroll.createdBy || null,
      // Sources breakdown — which accounts were debited
      sources: sourceAccounts.map(({ account, amount }) => ({
        accountId: account._id,
        accountName: account.name,
        amount: amount,
      })),
    });
    await expense.save({ session });
  } catch (expErr) {
    // Log but don't block — Expense schema may differ
    console.warn("Could not create Expense record:", expErr.message);
  }
};

// ─────────────────────────────────────────────
// ROUTES
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
    return res
      .status(200)
      .json({ success: true, count: mrList.length, data: mrList });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch staff list.",
        error: error.message,
      });
  }
});

router.get("/basic-payroll/employee/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(employeeId))
      return res
        .status(400)
        .json({ success: false, message: "Invalid employee ID" });
    const basicPayroll = await MrBasicPayroll.findOne({ employeeId });
    if (!basicPayroll)
      return res
        .status(404)
        .json({ success: false, message: "Basic payroll not found" });
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch basic payroll",
        error: error.message,
      });
  }
});

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
    const pageNum = parseInt(page),
      limitNum = parseInt(limit);
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
    if (search?.trim()) {
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
      obj.displayBasicSalary =
        obj.payrollType === "current" && obj.adjustedBasicSalary != null
          ? obj.adjustedBasicSalary
          : obj.basicSalary;
      return obj;
    });

    const total = await Payroll.countDocuments(finalConditions);
    const nextPayrollCode = await generateNextPayrollCode();
    res
      .status(200)
      .json({
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch payrolls",
        error: error.message,
      });
  }
});

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
    if (search?.trim()) {
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
      obj.displayBasicSalary =
        obj.payrollType === "current" && obj.adjustedBasicSalary != null
          ? obj.adjustedBasicSalary
          : obj.basicSalary;
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
      { label: "Adjusted Basic", value: "displayBasicSalary" },
      { label: "Allowances", value: "allowancesCSV" },
      { label: "Total Allowance", value: "totalAllowance" },
      { label: "Deductions", value: "deductions" },
      { label: "Net Salary", value: "netSalary" },
      { label: "Status", value: "status" },
      { label: "Payment Method", value: "paymentMethod" },
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to export",
        error: error.message,
      });
  }
});

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
            medicalRepName: p.employeeName || "Unknown",
          };
        return null;
      })
      .filter(Boolean);
    return res
      .status(200)
      .json({ success: true, count: mrList.length, data: mrList });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch employee list.",
        error: error.message,
      });
  }
});

router.get("/calculate/:employeeId/:period", async (req, res) => {
  try {
    const { employeeId, period } = req.params;
    if (!/^\d{4}-\d{2}$/.test(period))
      return res
        .status(400)
        .json({ success: false, message: "Period must be YYYY-MM" });
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to calculate salary",
        error: error.message,
      });
  }
});

router.get("/available-sources", async (req, res) => {
  try {
    const { excludeIds } = req.query;
    let query = { totalAmount: { $gt: 0 } };
    if (excludeIds) {
      const idsToExclude = excludeIds
        .split(",")
        .filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (idsToExclude.length > 0) query._id = { $nin: idsToExclude };
    }
    const accounts = await Account.find(query)
      .select("_id name code totalAmount balance")
      .lean();
    const options = accounts.map((account) => ({
      value: account._id,
      label: `${account.name || account.code || "Account"} ($${(account.totalAmount || account.balance || 0).toFixed(2)})`,
      balance: account.totalAmount || account.balance || 0,
    }));
    res.status(200).json({ success: true, data: options });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch sources",
        error: error.message,
      });
  }
});

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
    data.displayBasicSalary =
      data.payrollType === "current" && data.adjustedBasicSalary != null
        ? data.adjustedBasicSalary
        : data.basicSalary;
    const payments = await PayrollPayment.find({
      payrollId: payroll._id,
    }).populate("sourceAccount", "name code");
    data.paymentSplits = payments;
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid payroll ID" });
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch payroll",
        error: error.message,
      });
  }
});

// ─────────────────────────────────────────────
// POST /  — Create payroll
// ✅ FIX: validates sources[].accountId correctly
// ✅ NEW: creates cash/bank statement + expense entry
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
      sources,
    } = req.body;

    // ── Basic validation ─────────────────────────────────────────────────────
    if (!employeeId || !period)
      return res
        .status(400)
        .json({
          success: false,
          message: "Employee ID and period are required",
        });

    if (!/^\d{4}-\d{2}$/.test(period))
      return res
        .status(400)
        .json({ success: false, message: "Period must be YYYY-MM" });

    // ✅ FIX: check sources array and each source has accountId
    if (!sources || !Array.isArray(sources) || sources.length === 0)
      return res
        .status(400)
        .json({
          success: false,
          message: "At least one source account is required",
        });

    for (const src of sources) {
      if (!src.accountId)
        return res
          .status(400)
          .json({
            success: false,
            message: "Each source must have an accountId",
          });
      if (!mongoose.Types.ObjectId.isValid(src.accountId))
        return res
          .status(400)
          .json({
            success: false,
            message: `Invalid accountId: ${src.accountId}`,
          });
      if (!src.amount || parseFloat(src.amount) <= 0)
        return res
          .status(400)
          .json({
            success: false,
            message: "Each source must have a positive amount",
          });
    }

    const employee = await Staff.findById(employeeId).session(session);
    if (!employee)
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });

    const basicPayroll = await MrBasicPayroll.findOne({ employeeId }).session(
      session,
    );
    if (!basicPayroll)
      return res
        .status(404)
        .json({
          success: false,
          message: "Basic payroll not found. Set basic salary first.",
        });

    const existingPayroll = await Payroll.findOne({
      employeeId,
      period,
    }).session(session);
    if (existingPayroll)
      return res
        .status(409)
        .json({
          success: false,
          message: "Payroll already exists for this employee in this period",
        });

    // ── Salary calculation ───────────────────────────────────────────────────
    const salaryData = await calculateSalaryForPeriod(
      employeeId,
      period,
      session,
    );
    const sc = salaryData.salaryCalculation;
    const adjustedBasicSalaryNum = sc.adjustedBasicSalary;
    const fullBasicSalaryNum = sc.basicSalary;
    const advanceDeduction = sc.advanceDeduction;
    const leaveDeduction = sc.leaveDeduction;
    const extraTimeAmount = sc.extraTimeAmount;
    const deductionsNum = parseFloat(deductions) || 0;

    let totalAllowance = 0;
    const processedAllowances = [];
    if (allowances && Array.isArray(allowances)) {
      for (const allowance of allowances) {
        if (!allowance.type || allowance.amount === undefined)
          return res
            .status(400)
            .json({
              success: false,
              message: "Each allowance must have type and amount",
            });
        const amt = parseFloat(allowance.amount);
        if (isNaN(amt) || amt < 0)
          return res
            .status(400)
            .json({
              success: false,
              message: "Allowance amount must be non-negative",
            });
        totalAllowance += amt;
        processedAllowances.push({ type: allowance.type.trim(), amount: amt });
      }
    }

    let netSalary =
      adjustedBasicSalaryNum +
      totalAllowance -
      deductionsNum -
      advanceDeduction;
    if (netSalary > fullBasicSalaryNum) netSalary = fullBasicSalaryNum;
    if (netSalary < 0) netSalary = 0;

    // ── Validate source totals match netSalary ───────────────────────────────
    const totalSourcesAmount = sources.reduce(
      (s, src) => s + (parseFloat(src.amount) || 0),
      0,
    );
    if (Math.abs(totalSourcesAmount - netSalary) > 0.01)
      return res.status(400).json({
        success: false,
        message: `Source total ($${totalSourcesAmount.toFixed(2)}) must equal net salary ($${netSalary.toFixed(2)})`,
      });

    // ── Verify & lock source account balances ────────────────────────────────
    const sourceAccounts = [];
    for (const src of sources) {
      const account = await Account.findById(src.accountId).session(session);
      if (!account)
        throw new Error(`Source account ${src.accountId} not found`);
      const amount = parseFloat(src.amount);
      if (account.totalAmount < amount)
        throw new Error(
          `Insufficient balance in ${account.name}. Available: ${account.totalAmount}, Required: ${amount}`,
        );
      sourceAccounts.push({ account, amount });
    }

    // ── Create payroll record ────────────────────────────────────────────────
    const payrollCode = await generateNextPayrollCode(session);

    const payroll = new Payroll({
      employeeId,
      period,
      basicSalary: fullBasicSalaryNum,
      adjustedBasicSalary: adjustedBasicSalaryNum,
      proratedBasicSalary: sc.proratedBasicSalary,
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
      payrollType: "current",
      createdBy: req.user?._id,
      attendanceInfo: {
        totalWorkingDays: sc.totalWorkingDaysInMonth,
        workingDaysUntilCalculationDate: sc.workingDaysUntilCalculation,
        presentDays: sc.presentDays,
        totalLeaves: sc.totalLeaves,
        paidLeaves: sc.paidLeaves,
        unpaidLeaves: sc.unpaidLeaves,
        swapLeaves: sc.swapLeaves,
        perDaySalary: sc.perDaySalary,
        perMinuteSalary: sc.perMinuteSalary,
        leaveDeduction,
        extraMinutes: sc.extraMinutes,
        extraTimeAmount,
        calculationDate: sc.calculationEndDate,
      },
    });

    await payroll.save({ session });

    // ── Deduct from each source account & create PayrollPayment splits ───────
    for (const { account, amount } of sourceAccounts) {
      account.totalAmount -= amount;
      await account.save({ session });

      const payment = new PayrollPayment({
        payrollId: payroll._id,
        sourceAccount: account._id,
        amount,
        description: `Salary payment for ${period} - ${employee.medicalRepName}`,
      });
      await payment.save({ session });
    }

    // ── Mark pending advances as adjusted ────────────────────────────────────
    if (advanceDeduction > 0) {
      await MrAdvance.updateMany(
        { employeeId, status: "pending" },
        { $set: { status: "adjusted" } },
        { session },
      );
    }

    // ── ✅ Create Cash & Bank statement + Expense entry ──────────────────────
    await createPayrollFinancialRecords({
      payroll,
      employee,
      sourceAccounts,
      period,
      session,
    });

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
    responseData.displayBasicSalary = adjustedBasicSalaryNum;

    res.status(201).json({
      success: true,
      message:
        "Payroll created successfully. Cash & bank statement and expense entry recorded.",
      data: responseData,
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    if (error.name === "ValidationError")
      return res
        .status(400)
        .json({
          success: false,
          message: "Validation error",
          errors: Object.values(error.errors).map((v) => v.message),
        });
    if (error.code === 11000)
      return res
        .status(409)
        .json({
          success: false,
          message: "Payroll already exists for this period",
        });
    if (error.message.includes("Insufficient balance"))
      return res.status(400).json({ success: false, message: error.message });
    if (error.message.includes("not found"))
      return res.status(404).json({ success: false, message: error.message });
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to create payroll",
        error: error.message,
      });
  } finally {
    await session.endSession();
  }
});

router.post("/bulk", async (req, res) => {
  const records = req.body;
  if (!Array.isArray(records) || records.length === 0)
    return res
      .status(400)
      .json({ success: false, message: "Body must be a non-empty array" });

  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const results = [],
      errors = [];

    for (let i = 0; i < records.length; i++) {
      const {
        employeeId,
        period,
        basicSalary,
        allowances = [],
        totalAllowance = 0,
        deductions = 0,
        netSalary,
        status = "pending",
      } = records[i];
      if (!employeeId || !period) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: employeeId and period required`,
        });
        continue;
      }
      if (!/^\d{4}-\d{2}$/.test(String(period))) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: Period must be YYYY-MM`,
        });
        continue;
      }
      if (!mongoose.Types.ObjectId.isValid(employeeId)) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: Invalid employeeId`,
        });
        continue;
      }

      const employee = await Staff.findById(employeeId).session(session);
      if (!employee) {
        errors.push({
          index: i,
          message: `Record ${i + 1}: Employee not found`,
        });
        continue;
      }

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
      const cappedNet = Math.min(computedNet, basicNum);

      const processedAllowances = Array.isArray(allowances)
        ? allowances
            .filter((a) => a?.type)
            .map((a) => ({
              type: String(a.type).trim(),
              amount: parseFloat(a.amount) || 0,
            }))
        : [];

      try {
        const payroll = new Payroll({
          employeeId,
          period,
          basicSalary: basicNum,
          adjustedBasicSalary: basicNum,
          proratedBasicSalary: basicNum,
          extraTimeAmount: 0,
          allowances: processedAllowances,
          totalAllowance: allowanceNum,
          deductions: deductionNum,
          netSalary: cappedNet,
          status,
          paymentMethod: "bank",
          payrollType: "previous",
        });
        await payroll.save({ session });
        results.push({
          id: payroll._id,
          code: payroll.payrollCode,
          employee: employee.medicalRepName,
        });
      } catch (saveError) {
        const msg =
          saveError.name === "ValidationError"
            ? Object.values(saveError.errors)
                .map((e) => e.message)
                .join("; ")
            : saveError.message;
        errors.push({
          index: i,
          message: `Record ${i + 1} (${employee.medicalRepName}): ${msg}`,
        });
      }
    }

    if (results.length === 0) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "No records saved.", errors });
    }

    await session.commitTransaction();
    return res
      .status(201)
      .json({
        success: true,
        message: `${results.length} record(s) created${errors.length > 0 ? `, ${errors.length} skipped` : ""}`,
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
    res
      .status(500)
      .json({
        success: false,
        message: "Bulk payroll failed",
        error: error.message,
      });
  } finally {
    await session.endSession();
  }
});

router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
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

    const payroll = await Payroll.findById(req.params.id)
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

    const baseForNet =
      payroll.payrollType === "current" && payroll.adjustedBasicSalary != null
        ? payroll.adjustedBasicSalary
        : payroll.basicSalary;
    let newNetSalary = baseForNet + payroll.totalAllowance - payroll.deductions;
    if (newNetSalary > payroll.basicSalary) newNetSalary = payroll.basicSalary;
    if (newNetSalary < 0) newNetSalary = 0;
    payroll.netSalary = newNetSalary;

    const newSource = payroll.source;
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
      await updateAccountBalance(newSource, newNetSalary, "subtract", session);
    } else if (oldSource && !newSource) {
      await updateAccountBalance(oldSource._id, oldNetSalary, "add", session);
    }

    await payroll.save({ session });
    await payroll.populate(
      "employeeId",
      "medicalRepName teamName contactNo email",
    );
    await payroll.populate("source", "name code totalAmount");
    await session.commitTransaction();

    const basicPayrollRec = await MrBasicPayroll.findOne({
      employeeId: payroll.employeeId._id,
    });
    const responseData = payroll.toObject();
    if (responseData.employeeId) {
      responseData.employeeName = responseData.employeeId.medicalRepName;
      responseData.teamName = responseData.employeeId.teamName;
      responseData.employeeBasicSalary =
        basicPayrollRec?.currentBasicSalary || 0;
    }
    responseData.displayBasicSalary =
      responseData.payrollType === "current" &&
      responseData.adjustedBasicSalary != null
        ? responseData.adjustedBasicSalary
        : responseData.basicSalary;
    res
      .status(200)
      .json({
        success: true,
        message: "Payroll updated successfully",
        data: responseData,
      });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    if (error.name === "ValidationError")
      return res
        .status(400)
        .json({
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to update payroll",
        error: error.message,
      });
  } finally {
    await session.endSession();
  }
});

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
    if (payroll.source)
      await updateAccountBalance(
        payroll.source._id,
        payroll.netSalary,
        "add",
        session,
      );
    await PayrollPayment.deleteMany({ payrollId: payroll._id }).session(
      session,
    );
    await Payroll.findByIdAndDelete(req.params.id).session(session);
    await session.commitTransaction();
    res
      .status(200)
      .json({
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete payroll",
        error: error.message,
      });
  } finally {
    await session.endSession();
  }
});

router.delete("/", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "Array of payroll IDs required" });
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length)
      return res
        .status(400)
        .json({ success: false, message: "Some IDs are invalid" });

    const toDelete = await Payroll.find({ _id: { $in: validIds } })
      .populate("source")
      .session(session);
    if (toDelete.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "No payrolls found" });

    for (const p of toDelete) {
      if (p.source)
        await updateAccountBalance(p.source._id, p.netSalary, "add", session);
      await PayrollPayment.deleteMany({ payrollId: p._id }).session(session);
    }
    const result = await Payroll.deleteMany({ _id: { $in: validIds } }).session(
      session,
    );
    await session.commitTransaction();
    res
      .status(200)
      .json({
        success: true,
        message: `${result.deletedCount} payroll(s) deleted`,
        data: { deletedCount: result.deletedCount },
      });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete payrolls",
        error: error.message,
      });
  } finally {
    await session.endSession();
  }
});

export default router;
